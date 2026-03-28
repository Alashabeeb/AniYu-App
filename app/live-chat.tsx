import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView, Platform,
    ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where
} from 'firebase/firestore';

// ✅ SURGICAL FIX: Imported appCheck and getToken so we can send the security token
import { getToken } from 'firebase/app-check';
import { appCheck, auth, db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { uploadToR2 } from '../services/r2Storage';

// 🔐 SECURITY: Support message creation now goes through rate-limited Cloud Function
const CREATE_SUPPORT_MESSAGE_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/createSupportMessage";

// 🔐 SECURITY: Max message length guard
const MAX_MESSAGE_CHARS = 500;

export default function LiveChatScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const { user } = useAuth();

    const [view, setView] = useState<'list' | 'chat'>('list');
    
    const [tickets, setTickets] = useState<any[]>([]);
    const [activeTicket, setActiveTicket] = useState<any>(null);
    const [loadingTickets, setLoadingTickets] = useState(true);

    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    
    const flatListRef = useRef<FlatList>(null);

    // --- 1. FETCH TICKETS ---
    useEffect(() => {
        if (!user) return;
        const currentUser = user as any; 
        
        const q = query(collection(db, 'supportTickets'), where('userId', '==', currentUser.uid));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allTickets = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
            
            allTickets.sort((a, b) => {
                const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
                const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
                return timeB - timeA;
            });

            setTickets(allTickets);
            setLoadingTickets(false);

            if (activeTicket) {
                const updatedActive = allTickets.find(t => t.id === activeTicket.id);
                if (updatedActive) setActiveTicket(updatedActive);
            }
        }, (error) => {
            console.error("Firebase Error (Tickets):", error);
            setLoadingTickets(false);
        });

        return () => unsubscribe();
    }, [user]);

    // --- 2. FETCH MESSAGES ---
    useEffect(() => {
        if (view !== 'chat' || !activeTicket?.id) return;

        const q = query(collection(db, 'supportTickets', activeTicket.id, 'messages'), orderBy('createdAt', 'asc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);

            if (activeTicket.unreadUser) {
                updateDoc(doc(db, 'supportTickets', activeTicket.id), { unreadUser: false }).catch(() => {});
            }
        });

        return () => unsubscribe();
    }, [activeTicket?.id, view]);

    // --- 3. CREATE TICKET ---
    const handleCreateTicket = async () => {
        const openTickets = tickets.filter(t => t.status === 'pending' || t.status === 'active');
        if (openTickets.length >= 3) {
            Alert.alert("Limit Reached", "You can only have a maximum of 3 open tickets at a time.");
            return;
        }

        try {
            const currentUser = user as any; 
            const newTicketRef = await addDoc(collection(db, 'supportTickets'), {
                userId: currentUser.uid,
                userName: currentUser.username || currentUser.displayName || 'User',
                userAvatar: currentUser.profilePicture || currentUser.photoURL || null,
                status: 'pending', 
                unreadAdmin: false,
                unreadUser: false,
                lastMessage: 'Ticket Created',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            setActiveTicket({ id: newTicketRef.id, status: 'pending' });
            setView('chat');
        } catch (e) { Alert.alert("Error", "Could not create ticket. Try again."); }
    };

    const handleOpenTicket = (ticket: any) => {
        setActiveTicket(ticket);
        setView('chat');
    };

    // --- 4. SEND MESSAGE ---
    const handleSend = async () => {
        if ((!inputText.trim() && !imageUri) || !user || !activeTicket || sending) return;

        if (inputText.length > MAX_MESSAGE_CHARS) {
            Alert.alert("Too Long", `Message cannot exceed ${MAX_MESSAGE_CHARS} characters.`);
            return;
        }

        setSending(true);

        try {
            const currentTicketId = activeTicket.id;
            
            let uploadedImageUrl = null;
            if (imageUri) {
                const result = await uploadToR2(imageUri, `support/${currentTicketId}`);
                uploadedImageUrl = typeof result === 'string' ? result : (result as any).url;
            }

            const firebaseUser = auth.currentUser;
            if (!firebaseUser) throw new Error("Not authenticated");
            const idToken = await firebaseUser.getIdToken();

            // ✅ SURGICAL FIX: Grab the App Check VIP Pass
            const appCheckTokenResponse = await getToken(appCheck, false);

            const response = await fetch(CREATE_SUPPORT_MESSAGE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                    // ✅ SURGICAL FIX: Hand the VIP pass to the Cloud Function
                    'X-Firebase-AppCheck': appCheckTokenResponse.token
                },
                body: JSON.stringify({
                    ticketId: currentTicketId,
                    text: inputText.trim(),
                    imageUrl: uploadedImageUrl
                })
            });

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    Alert.alert("⛔ Slow Down", result.error || "You are sending too many messages. Please wait.");
                } else {
                    Alert.alert("Error", result.error || "Could not send your message.");
                }
                return;
            }

            setInputText('');
            setImageUri(null);
        } catch (error) { 
            console.error("Message Send Error: ", error); // Helpful for future debugging
            Alert.alert("Error", "Could not send your message."); 
        } 
        finally { setSending(false); }
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';
        const d = timestamp.toDate ? timestamp.toDate() : new Date();
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'Just now';
        const d = timestamp.toDate ? timestamp.toDate() : new Date();
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // =======================================================
    // RENDER: LIST VIEW
    // =======================================================
    if (view === 'list') {
        const openTickets = tickets.filter(t => t.status === 'pending' || t.status === 'active');
        const resolvedTickets = tickets.filter(t => t.status === 'resolved');

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <Stack.Screen options={{ headerShown: false }} />
                
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Support Tickets</Text>
                </View>

                {loadingTickets ? (
                    <View style={styles.centerBox}><ActivityIndicator size="large" color={theme.tint} /></View>
                ) : (
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Open Tickets ({openTickets.length}/3)</Text>
                        </View>
                        
                        {openTickets.length === 0 ? (
                            <View style={[styles.ticketCard, { backgroundColor: theme.card, alignItems: 'center', padding: 20 }]}>
                                <Text style={{ color: theme.subText, fontStyle: 'italic' }}>No open tickets right now.</Text>
                            </View>
                        ) : (
                            openTickets.map(ticket => (
                                <TouchableOpacity 
                                    key={ticket.id} 
                                    style={[styles.ticketCard, { backgroundColor: theme.card, borderColor: ticket.unreadUser ? theme.tint : theme.border, borderWidth: ticket.unreadUser ? 1 : 0 }]}
                                    onPress={() => handleOpenTicket(ticket)}
                                >
                                    <View style={styles.ticketHeader}>
                                        <View style={[styles.statusBadge, { backgroundColor: ticket.status === 'active' ? '#2563eb' : '#d97706' }]}>
                                            <Text style={styles.statusText}>{ticket.status.toUpperCase()}</Text>
                                        </View>
                                        <Text style={{ color: theme.subText, fontSize: 12 }}>{formatDate(ticket.updatedAt)}</Text>
                                    </View>
                                    <Text style={[styles.ticketLastMessage, { color: theme.text }]} numberOfLines={1}>{ticket.lastMessage}</Text>
                                    {ticket.unreadUser && <View style={[styles.unreadDot, { backgroundColor: theme.tint }]} />}
                                </TouchableOpacity>
                            ))
                        )}

                        <TouchableOpacity 
                            style={[styles.createBtn, { backgroundColor: openTickets.length >= 3 ? theme.border : theme.tint, marginTop: 10 }]}
                            onPress={handleCreateTicket}
                            disabled={openTickets.length >= 3}
                        >
                            <Ionicons name="add-circle-outline" size={20} color="white" />
                            <Text style={styles.createBtnText}>
                                {openTickets.length >= 3 ? "Max Open Tickets Reached" : "Create New Ticket"}
                            </Text>
                        </TouchableOpacity>

                        {resolvedTickets.length > 0 && (
                            <View style={{ marginTop: 30 }}>
                                <View style={styles.sectionHeader}>
                                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Resolved Tickets</Text>
                                </View>
                                {resolvedTickets.map(ticket => (
                                    <TouchableOpacity 
                                        key={ticket.id} 
                                        style={[styles.ticketCard, { backgroundColor: theme.card, opacity: 0.7 }]}
                                        onPress={() => handleOpenTicket(ticket)}
                                    >
                                        <View style={styles.ticketHeader}>
                                            <View style={[styles.statusBadge, { backgroundColor: '#16a34a' }]}>
                                                <Text style={styles.statusText}>RESOLVED</Text>
                                            </View>
                                            <Text style={{ color: theme.subText, fontSize: 12 }}>{formatDate(ticket.updatedAt)}</Text>
                                        </View>
                                        <Text style={[styles.ticketLastMessage, { color: theme.text }]} numberOfLines={1}>{ticket.lastMessage}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                )}
            </SafeAreaView>
        );
    }

    // =======================================================
    // RENDER: CHAT VIEW
    // =======================================================
    const renderMessage = ({ item }: { item: any }) => {
        if (item.senderModel === 'system') {
            return (
                <View style={{ alignItems: 'center', marginVertical: 12 }}>
                    <Text style={{ backgroundColor: theme.border, color: theme.subText, paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, fontSize: 11, fontWeight: 'bold' }}>
                        {item.text}
                    </Text>
                </View>
            );
        }

        const isMe = item.senderModel === 'user';
        
        return (
            <View style={[styles.messageWrapper, isMe ? styles.messageWrapperRight : styles.messageWrapperLeft]}>
                <View style={[
                    styles.messageBubble,
                    isMe 
                        ? { backgroundColor: theme.tint, borderBottomRightRadius: 4 } 
                        : { backgroundColor: theme.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.border }
                ]}>
                    {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />}
                    {item.text ? <Text style={[styles.messageText, { color: isMe ? 'white' : theme.text }]}>{item.text}</Text> : null}
                </View>
                <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            
            <View style={[styles.header, { borderBottomColor: theme.border, justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => { setView('list'); setActiveTicket(null); setMessages([]); }} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <View>
                        <Text style={[styles.headerTitle, { color: theme.text }]}>Support Desk</Text>
                        <Text style={{ color: theme.subText, fontSize: 12 }}>
                            {activeTicket?.status === 'active' 
                                ? 'Agent Online' 
                                : activeTicket?.status === 'pending' && activeTicket?.transferredBy
                                    ? `Transferred to ${activeTicket.assignedAdminName}`
                                : activeTicket?.status === 'pending' 
                                    ? 'Waiting for Agent...' 
                                : 'Closed Ticket'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* DYNAMIC ADMIN BANNER */}
            {activeTicket?.status === 'active' && activeTicket?.assignedAdminName && (
                <View style={[styles.adminBanner, { backgroundColor: theme.tint + '15' }]}>
                    <Ionicons name="shield-checkmark" size={16} color={theme.tint} />
                    <Text style={{ color: theme.tint, fontWeight: 'bold', fontSize: 12, marginLeft: 6 }}>
                        {activeTicket.assignedAdminName} is attending to your ticket.
                    </Text>
                </View>
            )}

            <KeyboardAvoidingView 
                style={styles.keyboardView} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0} 
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.chatContainer}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="chatbubble-ellipses-outline" size={60} color={theme.subText} style={{ opacity: 0.3, marginBottom: 10 }} />
                            <Text style={[styles.emptyText, { color: theme.text }]}>How can we help you today?</Text>
                            <Text style={{ color: theme.subText, fontSize: 13, textAlign: 'center', marginTop: 5 }}>
                                Detail your issue below and attach screenshots if necessary.{"\n"}Our support team will reply shortly.
                            </Text>
                        </View>
                    }
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                />

                {/* CHAT INPUT AREA */}
                {activeTicket?.status !== 'resolved' ? (
                    <View style={[styles.inputContainer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                        {imageUri && (
                            <View style={styles.imagePreviewContainer}>
                                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                                <TouchableOpacity onPress={() => setImageUri(null)} style={styles.closePreviewBtn}>
                                    <Ionicons name="close" size={16} color="white" />
                                </TouchableOpacity>
                            </View>
                        )}
                        
                        <View style={styles.inputRow}>
                            <TouchableOpacity onPress={pickImage} style={styles.attachBtn}>
                                <Ionicons name="image-outline" size={24} color={theme.subText} />
                            </TouchableOpacity>
                            
                            <TextInput
                                style={[styles.textInput, { color: theme.text, backgroundColor: theme.background }]}
                                placeholder="Type your message..."
                                placeholderTextColor={theme.subText}
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                maxLength={MAX_MESSAGE_CHARS}
                            />
                            
                            <TouchableOpacity 
                                style={[styles.sendBtn, { backgroundColor: (!inputText.trim() && !imageUri) ? theme.border : theme.tint }]}
                                onPress={handleSend}
                                disabled={sending || (!inputText.trim() && !imageUri)}
                            >
                                {sending ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="send" size={18} color="white" />}
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={[styles.resolvedBanner, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                        <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                        <Text style={{ color: theme.text, fontWeight: 'bold', marginLeft: 8 }}>
                            Resolved by {activeTicket.resolvedBy || 'Support Team'}
                        </Text>
                    </View>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
    backBtn: { marginRight: 15 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    // LIST VIEW STYLES
    sectionHeader: { marginBottom: 10 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold' },
    ticketCard: { padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 2, position: 'relative' },
    ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    ticketLastMessage: { fontSize: 14, fontWeight: '500' },
    unreadDot: { position: 'absolute', top: 15, right: -5, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: 'white' },
    createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12 },
    createBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

    // CHAT VIEW STYLES
    adminBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8 },
    keyboardView: { flex: 1 },
    chatContainer: { padding: 15, flexGrow: 1, paddingBottom: 20 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 16, fontWeight: 'bold' },
    
    messageWrapper: { marginBottom: 15, maxWidth: '80%' },
    messageWrapperLeft: { alignSelf: 'flex-start' },
    messageWrapperRight: { alignSelf: 'flex-end' },
    messageBubble: { padding: 12, borderRadius: 16 },
    messageText: { fontSize: 15, lineHeight: 22 },
    messageImage: { width: 200, height: 200, borderRadius: 10, marginBottom: 5 },
    timeText: { fontSize: 10, color: '#9ca3af', marginTop: 4, alignSelf: 'flex-end', paddingHorizontal: 5 },

    inputContainer: { padding: 10, borderTopWidth: 1 },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
    attachBtn: { padding: 10, justifyContent: 'center' },
    textInput: { flex: 1, minHeight: 40, maxHeight: 100, borderRadius: 20, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 10, fontSize: 15 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, marginBottom: 2 },
    
    imagePreviewContainer: { position: 'relative', width: 80, height: 80, marginBottom: 10, marginLeft: 10 },
    imagePreview: { width: '100%', height: '100%', borderRadius: 10 },
    closePreviewBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 12, padding: 2 },
    
    resolvedBanner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20, borderTopWidth: 1 }
});