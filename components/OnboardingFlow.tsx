import { Ionicons } from '@expo/vector-icons';
import { arrayUnion, collection, doc, getDocs, limit, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';

const CREATE_POST_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/createPost";

interface OnboardingProps {
    onComplete: () => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingProps) {
    const { theme } = useTheme();
    const user = auth.currentUser;

    const [step, setStep] = useState(1);
    const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [postText, setPostText] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (step === 2) {
            fetchSuggestedUsers();
        }
    }, [step]);

    const fetchSuggestedUsers = async () => {
        setLoading(true);
        try {
            // 1. Pull Creators & Moderators first (up to 10 just in case)
            const vipQ = query(
                collection(db, 'users'),
                where('role', 'in', ['super_admin', 'admin', 'anime_producer', 'manga_producer']),
                limit(10)
            );
            const vipSnap = await getDocs(vipQ);
            const vipUsers = vipSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 2. Pull a larger batch of regular users to pad the list
            const regQ = query(
                collection(db, 'users'), 
                where('role', '==', 'user'), 
                limit(15) 
            );
            const regSnap = await getDocs(regQ);
            const regularUsers = regSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 3. Combine them (VIPs on top), filter out the current user, and grab exactly 10
            const combinedUsers = [...vipUsers, ...regularUsers].filter(u => u.id !== user?.uid);

            setSuggestedUsers(combinedUsers.slice(0, 10));
        } catch (error) {
            console.error("Error fetching onboarding users:", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleUser = (id: string) => {
        if (selectedUsers.includes(id)) {
            setSelectedUsers(selectedUsers.filter(uid => uid !== id));
        } else {
            setSelectedUsers([...selectedUsers, id]);
        }
    };

    const handleFinalSubmit = async () => {
        if (!user || !postText.trim()) return;
        setLoading(true);

        try {
            // 1. Execute Follows via Batch Write
            if (selectedUsers.length > 0) {
                const batch = writeBatch(db);
                const currentUserRef = doc(db, 'users', user.uid);
                
                selectedUsers.forEach(targetId => {
                    const targetRef = doc(db, 'users', targetId);
                    batch.update(currentUserRef, { following: arrayUnion(targetId) });
                    batch.update(targetRef, { followers: arrayUnion(user.uid) });
                });
                
                // Update onboarding flag in the same batch
                batch.update(currentUserRef, { hasCompletedOnboarding: true });
                await batch.commit();
            } else {
                await updateDoc(doc(db, 'users', user.uid), { hasCompletedOnboarding: true });
            }

            // 2. Publish the First Post via your Cloud Function
            const idToken = await user.getIdToken();
            await fetch(CREATE_POST_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    text: postText.trim(),
                    mediaUrl: null,
                    mediaType: null,
                    tags: ["Discussion"], 
                    displayName: user.displayName || "Anonymous",
                    username: "new_user", 
                    role: "user"
                })
            });

            onComplete();
        } catch (error) {
            console.error("Onboarding failed:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* STEP 1: WELCOME */}
            {step === 1 && (
                <View style={styles.stepContainer}>
                    <View style={[styles.iconWrapper, { backgroundColor: theme.card, borderColor: theme.tint, borderWidth: 2 }]}>
                        <Ionicons name="sparkles" size={60} color={theme.tint} />
                    </View>
                    <Text style={[styles.title, { color: theme.text }]}>WELCOME TO THE ANIYU COMMUNITY!</Text>
                    <Text style={[styles.subtitle, { color: theme.subText }]}>
                        The ultimate sanctuary where anime and manga aren't just hobbies—they are a way of life. 
                        Dive into discussions, discover hidden gems, and connect with fans who share your passion. 
                    </Text>
                    <TouchableOpacity style={[styles.button, { backgroundColor: theme.tint, shadowColor: theme.tint }]} onPress={() => setStep(2)}>
                        <Text style={styles.buttonText}>Get Started</Text>
                        <Ionicons name="arrow-forward" size={20} color="white" />
                    </TouchableOpacity>
                </View>
            )}

            {/* STEP 2: FOLLOW USERS */}
            {step === 2 && (
                <View style={styles.stepContainerTop}>
                    <Text style={[styles.title, { color: theme.text, marginTop: 20 }]}>Curate Your Feed</Text>
                    <Text style={[styles.subtitle, { color: theme.subText }]}>
                        Follow at least 5 fellow fans to populate your timeline with the best content.
                    </Text>
                    
                    <View style={styles.counterBadge}>
                        <Text style={{ color: selectedUsers.length >= 5 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {selectedUsers.length} / 5 Selected
                        </Text>
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                    ) : (
                        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                            {suggestedUsers.map((u) => {
                                const isSelected = selectedUsers.includes(u.id);
                                const isCreatorOrMod = ['super_admin', 'admin', 'anime_producer', 'manga_producer'].includes(u.role);
                                
                                return (
                                    <TouchableOpacity 
                                        key={u.id} 
                                        style={[styles.userCard, { backgroundColor: theme.card, borderColor: isSelected ? theme.tint : theme.border }]}
                                        onPress={() => toggleUser(u.id)}
                                        activeOpacity={0.8}
                                    >
                                        <Image source={{ uri: u.avatar || 'https://via.placeholder.com/150' }} style={styles.avatar} />
                                        <View style={styles.userInfo}>
                                            <Text style={[styles.userName, { color: theme.text }]}>{u.displayName || 'Anonymous'}</Text>
                                            <Text style={{ color: theme.subText, fontSize: 12 }}>@{u.username || 'user'}</Text>
                                            {isCreatorOrMod && (
                                                <Text style={styles.vipBadge}>
                                                    {u.role.includes('admin') ? 'MODERATOR' : 'CREATOR'}
                                                </Text>
                                            )}
                                        </View>
                                        <View style={[styles.checkCircle, { backgroundColor: isSelected ? theme.tint : 'transparent', borderColor: isSelected ? theme.tint : theme.border }]}>
                                            {isSelected && <Ionicons name="checkmark" size={16} color="white" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}

                    <View style={styles.footer}>
                        <TouchableOpacity 
                            style={[styles.button, { backgroundColor: theme.tint, shadowColor: theme.tint, opacity: selectedUsers.length >= 5 ? 1 : 0.5 }]} 
                            disabled={selectedUsers.length < 5}
                            onPress={() => setStep(3)}
                        >
                            <Text style={styles.buttonText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* STEP 3: FIRST POST */}
            {step === 3 && (
                <View style={styles.stepContainerTop}>
                    <Text style={[styles.title, { color: theme.text, marginTop: 20 }]}>Introduce Yourself!</Text>
                    <Text style={[styles.subtitle, { color: theme.subText }]}>
                        Make your first post. Tell the community what your favorite anime is right now!
                    </Text>

                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                        placeholder="What's your all-time favorite anime and why?"
                        placeholderTextColor={theme.subText}
                        multiline
                        autoFocus
                        maxLength={120}
                        value={postText}
                        onChangeText={setPostText}
                    />
                    <Text style={{ alignSelf: 'flex-end', color: theme.subText, fontSize: 12, marginTop: 5 }}>
                        {postText.length}/120
                    </Text>

                    <View style={styles.footer}>
                        <TouchableOpacity 
                            style={[styles.button, { backgroundColor: theme.tint, shadowColor: theme.tint, opacity: postText.trim().length > 0 && !loading ? 1 : 0.5 }]} 
                            disabled={postText.trim().length === 0 || loading}
                            onPress={handleFinalSubmit}
                        >
                            {loading ? <ActivityIndicator color="white" /> : (
                                <>
                                    <Text style={styles.buttonText}>Publish & Enter Feed</Text>
                                    <Ionicons name="rocket" size={20} color="white" />
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, zIndex: 100 }, 
    stepContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    stepContainerTop: { flex: 1, alignItems: 'center', padding: 20 },
    iconWrapper: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    title: { fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 15, letterSpacing: -0.5 },
    subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 30 },
    
    button: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 30, alignItems: 'center', justifyContent: 'center', width: '100%', elevation: 2, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
    buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginRight: 8 },
    
    counterBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
    
    list: { width: '100%', flex: 1 },
    userCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, borderWidth: 2, marginBottom: 10 },
    avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
    userInfo: { flex: 1 },
    userName: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
    vipBadge: { color: '#9333ea', fontSize: 10, fontWeight: '900', marginTop: 4, letterSpacing: 0.5 },
    
    checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    
    input: { width: '100%', height: 150, borderRadius: 16, borderWidth: 1, padding: 20, fontSize: 16, textAlignVertical: 'top', marginTop: 20 },
    
    footer: { width: '100%', paddingVertical: 20 }
});