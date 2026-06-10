import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

// Global uygulama kimlikleri ve Firebase Yapılandırması
const appId = 'nexus-chat-live-version'; 

const firebaseConfig = {
  apiKey: "AIzaSyBpnba2Hya1KD4ron5W3m0BMfx-VIo_IME",
  authDomain: "nexus-chat-12276.firebaseapp.com",
  projectId: "nexus-chat-12276",
  storageBucket: "nexus-chat-12276.firebasestorage.app",
  messagingSenderId: "619576057900",
  appId: "1:619576057900:web:0c42db7690cc00cb2e3189",
  measurementId: "G-Q0LXBN0BE3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null); 
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState(null); 
  const [savedAccounts, setSavedAccounts] = useState([]); 
  
  const [authMode, setAuthMode] = useState('saved'); 
  const [usernameInput, setUsernameInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  
  const [allUsers, setAllUsers] = useState([]);
  const [allServers, setAllServers] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [allFriendRequests, setAllFriendRequests] = useState([]);

  const [activeTab, setActiveTab] = useState('home');
  const [homeSubTab, setHomeSubTab] = useState('friends');
  const [activeChannelId, setActiveChannelId] = useState('genel');
  const [activeDmRecipient, setActiveDmRecipient] = useState(null);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false); 
  
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newServerName, setNewServerName] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');
  
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  
  const [showNewServerModal, setShowNewServerModal] = useState(false);
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');

  const messagesEndRef = useRef(null);

  const showNotification = (message, type = 'info') => {
    const id = crypto.randomUUID();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  const isAdmin = currentUserProfile?.username === '1yigitt1_';

  // AUTH INIT
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        showNotification("Bağlantı hatası: " + error.message, "error");
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // DATA LISTENERS
  useEffect(() => {
    if (!user) return;
    let unProfile = null;
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid);
    const unSession = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSavedAccounts(data.savedAccounts || []);
        if (data.status === 'logged_out') {
          if (unProfile) { unProfile(); unProfile = null; }
          setCurrentUserProfile(null);
          setAuthMode((data.savedAccounts && data.savedAccounts.length > 0) ? 'saved' : 'register');
          return;
        }
        const targetProfileUid = data.profileUid;
        if (!targetProfileUid) return;
        if (unProfile) unProfile(); 
        unProfile = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetProfileUid), (pSnap) => {
          if (pSnap.exists()) {
            setCurrentUserProfile(pSnap.data());
            setEditDisplayName(pSnap.data().displayName);
            setEditAvatarUrl(pSnap.data().avatar);
          } else { setCurrentUserProfile(null); }
        });
      } else {
        setCurrentUserProfile(null); setSavedAccounts([]); setAuthMode('register');
      }
    });

    const unUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snap) => {
      const list = []; snap.forEach(d => list.push(d.data())); setAllUsers(list);
    });
    const unServers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'servers'), (snap) => {
      const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() })); setAllServers(list);
    });
    const unReqs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'friend_requests'), (snap) => {
      const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() })); setAllFriendRequests(list);
    });
    const unMsgs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), (snap) => {
      const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => a.timestamp - b.timestamp);
      setAllMessages(list);
    });

    return () => { unSession(); if (unProfile) unProfile(); unUsers(); unServers(); unReqs(); unMsgs(); };
  }, [user]);

  // SEKMEYİ VEYA TARAYICIYI KAPATINCA OTOMATİK OFFLINE YAPMA (YENİ)
  useEffect(() => {
    const handleWindowClose = () => {
      if (currentUserProfile?.uid) {
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { 
          status: 'offline' 
        }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleWindowClose);
    return () => window.removeEventListener('beforeunload', handleWindowClose);
  }, [currentUserProfile]);

  // OKUNMUŞ MESAJ SİSTEMİ
  useEffect(() => {
    if (!currentUserProfile || !user) return;
    const currentContext = activeTab === 'home' && activeDmRecipient ? activeDmRecipient.uid : activeTab.replace('server-', '');
    if (currentContext && currentContext !== 'home') {
      const lastReadTime = currentUserProfile.lastRead?.[currentContext] || 0;
      const contextMsgs = allMessages.filter(m => m.serverId === currentContext || (m.serverId === 'dm' && (m.senderId === currentContext || m.channelId === currentContext)));
      
      if (contextMsgs.length > 0) {
        const latestMsgTime = contextMsgs[contextMsgs.length - 1].timestamp;
        if (latestMsgTime > lastReadTime) {
          updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), {
            [`lastRead.${currentContext}`]: Date.now()
          }).catch(()=>{});
        }
      }
    }
  }, [activeTab, activeDmRecipient, allMessages, currentUserProfile]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [allMessages, activeTab, activeChannelId, activeDmRecipient]);

  // HESAP FONKSİYONLARI
  const saveAccountToDevice = async (profile) => {
    if (!user) return;
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid);
    const snap = await getDoc(sessionRef);
    let newSaved = snap.exists() && snap.data().savedAccounts ? snap.data().savedAccounts : [];
    newSaved = newSaved.filter(a => a.uid !== profile.uid);
    newSaved.push({ uid: profile.uid, username: profile.username, displayName: profile.displayName, avatar: profile.avatar });
    await setDoc(sessionRef, { profileUid: profile.uid, status: 'active', savedAccounts: newSaved }, { merge: true });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim().toLowerCase().replace(/\s+/g, '');
    const cleanDisplay = displayNameInput.trim();
    if (!cleanUser || !cleanDisplay || !passwordInput) return showNotification("Lütfen tüm alanları doldurun.", "warning");
    if (allUsers.some(u => u.username === cleanUser)) return showNotification(`@${cleanUser} kullanıcı adı zaten alınmış!`, "error");

    try {
      const newProfileId = crypto.randomUUID(); 
      const newProfile = {
        uid: newProfileId, username: cleanUser, displayName: cleanDisplay, password: passwordInput,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUser)}`,
        status: 'online', friends: [], banned: false, hiddenDMs: [], blockedUsers: [], lastRead: {}
      };
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', newProfileId), newProfile);
      await saveAccountToDevice(newProfile);
      setUsernameInput(''); setPasswordInput(''); setDisplayNameInput('');
      showNotification(`Hesabınız oluşturuldu. Hoş geldin, ${cleanDisplay}!`, "success");
    } catch (error) { showNotification("Kayıt hatası.", "error"); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim().toLowerCase().replace(/\s+/g, '');
    if (!cleanUser || !passwordInput) return showNotification("Kullanıcı adı ve şifre gereklidir.", "warning");
    const foundUser = allUsers.find(u => u.username === cleanUser && u.password === passwordInput);
    if (foundUser) {
      if (foundUser.banned) return showNotification("Bu hesap sistemden yasaklanmıştır!", "error");
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.uid), { status: 'online' });
        await saveAccountToDevice(foundUser);
        setUsernameInput(''); setPasswordInput('');
        showNotification(`Tekrar hoş geldin, ${foundUser.displayName}!`, "success");
      } catch (err) { showNotification("Giriş yapılırken hata oluştu.", "error"); }
    } else { showNotification("Kullanıcı adı veya şifre hatalı!", "error"); }
  };

  const handleQuickLogin = async (accountUid) => {
    if (!user) return;
    const targetUser = allUsers.find(u => u.uid === accountUid);
    if (targetUser?.