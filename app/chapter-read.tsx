import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AdConfig } from '../config/adConfig';

import { useTheme } from '../context/ThemeContext';
import { getMangaHistory, saveReadProgress } from '../services/historyService';
import { getAdjacentChapter } from '../services/mangaService'; // ✅ NEW IMPORT

const interstitial = InterstitialAd.createForAdRequest(AdConfig.interstitial, {
  requestNonPersonalizedAdsOnly: true,
});

export default function MangaReaderScreen() {
  const { url, title, mangaId, chapterId, chapterNum } = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  
  const [loading, setLoading] = useState(true);
  
  const [localPdfData, setLocalPdfData] = useState<string | null>(null);
  const [initialPage, setInitialPage] = useState(1);
  const [isHistoryReady, setIsHistoryReady] = useState(false);

  const [adLoaded, setAdLoaded] = useState(false);
  const [nextChapterParams, setNextChapterParams] = useState<any>(null); 

  useEffect(() => {
    const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => { setAdLoaded(true); });
    const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      setAdLoaded(false); interstitial.load(); 
      if (nextChapterParams) { router.replace(nextChapterParams); setNextChapterParams(null); }
    });
    interstitial.load();
    return () => { unsubscribeLoaded(); unsubscribeClosed(); };
  }, [nextChapterParams]);

  // Load Progress
  useEffect(() => {
      const loadHistory = async () => {
          try {
            if (mangaId && chapterId) {
                const history = await getMangaHistory();
                const item = history.find(h => String(h.mal_id) === String(mangaId) && String(h.chapterId) === String(chapterId));
                if (item && item.page > 1) { setInitialPage(item.page); }
            }
          } catch (e) { console.log("Error loading history:", e); } 
          finally { setIsHistoryReady(true); }
      };
      loadHistory();
  }, [mangaId, chapterId]);

  // Prepare File
  useEffect(() => {
      if (!url) return;
      const fileUrl = url as string;
      const prepareFile = async () => {
          if (fileUrl.startsWith('file://')) {
              try {
                  const base64 = await FileSystem.readAsStringAsync(fileUrl, { encoding: 'base64' });
                  setLocalPdfData(base64);
              } catch (e) { console.error("Failed to load local file", e); }
          } else { setLocalPdfData(null); }
      };
      prepareFile();
  }, [url]);

  // ✅ OPTIMIZED NAVIGATION (Efficient Fetch)
  const handleNavigate = async (direction: 'next' | 'prev') => {
      // 1. Save Progress
      if (mangaId && direction === 'next') {
        saveReadProgress(
            { mal_id: mangaId, title: title?.toString().split(' - ')[0] }, 
            { id: chapterId, number: chapterNum, title: title?.toString().split(' - ')[1] }, 
            1 
        );
      }

      setLoading(true);

      // 2. Fetch Single Document
      // ✅ FIX: Added ': any' here to solve the TypeScript error
      const nextChap: any = await getAdjacentChapter(mangaId as string, Number(chapterNum), direction);
      
      if (!nextChap) {
          alert("No more chapters in this direction.");
          setLoading(false);
          return;
      }

      const nextUrl = nextChap.pages && nextChap.pages.length > 0 ? nextChap.pages[0] : null;
      if (!nextUrl) {
          alert("Next chapter file unavailable");
          setLoading(false);
          return;
      }

      const newParams = {
        pathname: '/chapter-read' as const,
        params: {
            url: nextUrl, 
            title: `${title?.toString().split(' - ')[0]} - ${nextChap.title || 'Chapter ' + nextChap.number}`,
            mangaId,
            chapterId: nextChap.id || nextChap.number,
            chapterNum: nextChap.number
        }
      };

      if (direction === 'next' && adLoaded) {
          setNextChapterParams(newParams); 
          interstitial.show();             
      } else {
          router.replace(newParams);       
      }
      setLoading(false);
  };

  const handleMessage = (event: any) => {
      const data = event.nativeEvent.data;
      if (data === "Loaded") { setLoading(false); } 
      else if (data.startsWith("Page:")) {
          const page = parseInt(data.split(":")[1]);
          if (mangaId) {
            saveReadProgress(
                { mal_id: mangaId, title: title?.toString().split(' - ')[0] }, 
                { id: chapterId, number: chapterNum, title: title?.toString().split(' - ')[1] }, 
                page
            );
          }
      }
  };

  if (!url || !isHistoryReady) {
      return (
        <View style={[styles.container, { backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={theme.tint} />
        </View>
      );
  }

  // HTML Content Construction
  let pdfJsSource = '';
  if (localPdfData) { pdfJsSource = `data: atob('${localPdfData}')`; } 
  else {
      let fixedUrl = url as string;
      if (fixedUrl.includes('firebasestorage.googleapis.com') && fixedUrl.includes('/o/')) {
          const parts = fixedUrl.split('?');
          const baseUrl = parts[0];
          const queryParams = parts.slice(1).join('?');
          const oIndex = baseUrl.indexOf('/o/');
          if (oIndex !== -1) {
              const prefix = baseUrl.substring(0, oIndex + 3);
              const path = baseUrl.substring(oIndex + 3);
              fixedUrl = `${prefix}${encodeURIComponent(decodeURIComponent(path))}?${queryParams}`;
          }
      }
      pdfJsSource = `'${fixedUrl}'`;
  }

  const pdfViewerHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
      <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';</script>
      <style>
        body { margin: 0; padding: 0; background-color: #121212; display: flex; flex-direction: column; align-items: center; }
        canvas { margin-bottom: 0px; display: block; max-width: 100%; height: auto; }
        .loading { color: #888; font-family: sans-serif; margin-top: 50%; font-size: 16px; }
      </style>
    </head>
    <body>
      <div id="container">
        <div class="loading">Rendering Chapter...</div>
      </div>
      <script>
        const container = document.getElementById('container');
        let currentPage = 1;
        const startPage = ${initialPage};

        window.onscroll = function() {
            const canvases = document.getElementsByTagName('canvas');
            for (let i = 0; i < canvases.length; i++) {
                const rect = canvases[i].getBoundingClientRect();
                if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
                    if (currentPage !== i + 1) {
                        currentPage = i + 1;
                        window.ReactNativeWebView.postMessage("Page:" + currentPage);
                    }
                    break;
                }
            }
        };

        const loadPdf = async () => {
            try {
                const source = ${localPdfData ? `{ data: new Uint8Array([${localPdfData ? '...atob("' + localPdfData + '").split("").map(c => c.charCodeAt(0))' : ''}]) }` : pdfJsSource};
                
                const loadingTask = pdfjsLib.getDocument(source);
                const pdf = await loadingTask.promise;
                container.innerHTML = ''; 
                
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    await pdf.getPage(pageNum).then(page => {
                        const viewport = page.getViewport({ scale: 2.0 });
                        const canvas = document.createElement('canvas');
                        canvas.id = 'page-' + pageNum; 
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        canvas.style.width = '100%';
                        container.appendChild(canvas);
                        
                        const renderContext = { canvasContext: context, viewport: viewport };
                        return page.render(renderContext).promise;
                    });
                }
                
                if (startPage > 1) {
                    setTimeout(() => {
                        const target = document.getElementById('page-' + startPage);
                        if (target) {
                             target.scrollIntoView({ behavior: 'auto', block: 'start' });
                        }
                    }, 300);
                }

                window.ReactNativeWebView.postMessage("Loaded");
            } catch (err) {
                container.innerHTML = '<div style="color:red; margin-top:20px; text-align:center;">Error: ' + err.message + '</div>';
            }
        };

        loadPdf();
      </script>
    </body>
    </html>
  `;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'black' }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Chapter'}</Text>
          <View style={{ width: 40 }} /> 
      </View>
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
          {loading && (
              <View style={styles.loader}>
                  <ActivityIndicator size="large" color={theme.tint} />
                  <Text style={{color:'white', marginTop:10}}>Loading...</Text>
              </View>
          )}
          <WebView
            originWhitelist={['*']}
            source={{ html: pdfViewerHtml }}
            style={{ flex: 1, backgroundColor: '#121212' }}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
      </View>
      {!loading && (
          <View style={styles.footer}>
              <TouchableOpacity onPress={() => handleNavigate('prev')} style={styles.navBtn}>
                  <Ionicons name="chevron-back" size={24} color="white" />
                  <Text style={{color:'white', marginLeft: 5}}>Prev</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleNavigate('next')} style={styles.navBtn}>
                  <Text style={{color:'white', marginRight: 5}}>Next</Text>
                  <Ionicons name="chevron-forward" size={24} color="white" />
              </TouchableOpacity>
          </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 60, backgroundColor: 'rgba(0,0,0,0.8)' },
  backBtn: { padding: 5 },
  headerTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  loader: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'black', zIndex: 5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: 'rgba(0,0,0,0.8)' },
  navBtn: { flexDirection: 'row', alignItems: 'center' }
});