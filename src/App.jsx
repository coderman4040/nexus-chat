import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

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

// Firebase Başlatma
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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

  // SESLİ / GÖRÜNTÜLÜ ARAMA STATE'LERİ
  const [activeCallRoom, setActiveCallRoom] = useState(null);

  // DOSYA YÜKLEME STATE'LERİ
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const messagesEndRef = useRef(null);

  const showNotification = (message, type = 'info') => {
    const id = crypto.randomUUID();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4000);
  };

  const isAdmin = currentUserProfile?.username === '1yigitt1_';

  // 1. AUTHENTICATION INIT
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
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

  // 2. VERİTABANI ANLIK DİNLEYİCİLERİ
  useEffect(() => {
    if (!user) return;
    let unProfile = null;
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid);
    const unSession = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSavedAccounts(data.savedAccounts || []);
        if (data.status === 'logged_out') {
          if (unProfile) unProfile();
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
      const list = []; snap.forEach((d) => list.push(d.data())); setAllUsers(list);
    });
    const unServers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'servers'), (snap) => {
      const list = []; snap.forEach((d) => list.push({ id: d.id, ...d.data() })); setAllServers(list);
    });
    const unReqs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'friend_requests'), (snap) => {
      const list = []; snap.forEach((d) => list.push({ id: d.id, ...d.data() })); setAllFriendRequests(list);
    });
    const unMsgs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), (snap) => {
      const list = []; snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => a.timestamp - b.timestamp);
      setAllMessages(list);
    });

    return () => { unSession(); if (unProfile) unProfile(); unUsers(); unServers(); unReqs(); unMsgs(); };
  }, [user]);

  // 3. OFFLINE YAPMA DINLEYICISI
  useEffect(() => {
    const handleWindowClose = () => {
      if (currentUserProfile?.uid) {
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { status: 'offline' }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleWindowClose);
    return () => window.removeEventListener('beforeunload', handleWindowClose);
  }, [currentUserProfile]);

  // 4. OKUNMUŞ MESAJ SİSTEMİ
  useEffect(() => {
    if (!currentUserProfile || !user) return;
    const currentContext = activeTab === 'home' && activeDmRecipient ? activeDmRecipient.uid : activeTab.replace('server-', '');
    if (currentContext && currentContext !== 'home') {
      const lastReadTime = currentUserProfile.lastRead?.[currentContext] || 0;
      const contextMsgs = allMessages.filter(m => m.serverId === currentContext || (m.serverId === 'dm' && (m.senderId === currentContext || m.channelId === currentContext)));
      if (contextMsgs.length > 0) {
        const latestMsgTime = contextMsgs[contextMsgs.length - 1].timestamp;
        if (latestMsgTime > lastReadTime) {
          updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { [`lastRead.${currentContext}`]: Date.now() }).catch(() => {});
        }
      }
    }
  }, [activeTab, activeDmRecipient, allMessages, currentUserProfile]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [allMessages, activeTab, activeChannelId, activeDmRecipient]);

  // --- DOSYA YÜKLEME FONKSİYONU ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUserProfile) return;

    if (file.size > 50 * 1024 * 1024) { // 50MB sınırı
      return showNotification("Dosya boyutu en fazla 50MB olabilir.", "error");
    }

    const fileRef = ref(storage, `nexus_uploads/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(fileRef, file);

    setIsUploading(true);
    setUploadProgress(0);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      }, 
      (error) => {
        setIsUploading(false);
        showNotification("Yükleme başarısız oldu.", "error");
      }, 
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setIsUploading(false);
        setUploadProgress(0);
        
        // Mesaj olarak gönder
        const isServer = activeTab.startsWith('server-');
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
          serverId: isServer ? activeTab.replace('server-', '') : 'dm',
          channelId: isServer ? activeChannelId : activeDmRecipient.uid,
          senderId: currentUserProfile.uid,
          senderUsername: currentUserProfile.username, 
          senderDisplayName: currentUserProfile.displayName,
          senderAvatar: currentUserProfile.avatar,
          text: "", // Dosyalar için metin boş
          fileUrl: downloadURL,
          fileName: file.name,
          fileType: file.type,
          timestamp: Date.now(), 
          deletedFor: [] 
        });
      }
    );
    e.target.value = null; // reset input
  };

  // --- SESLİ ARAMA BAŞLATMA ---
  const startVoiceCall = () => {
    let roomId = "";
    if (activeTab === 'home' && activeDmRecipient) {
      // İki kişi arasındaki arama için benzersiz ama sabit bir oda kodu oluştur (uid'leri alfabetik sıraya diz)
      const uids = [currentUserProfile.uid, activeDmRecipient.uid].sort();
      roomId = `nexus-dm-${uids[0]}-${uids[1]}`;
    } else if (activeTab.startsWith('server-')) {
      // Sunucu kanalı araması
      roomId = `nexus-server-${activeTab.replace('server-', '')}-${activeChannelId}`;
    }
    setActiveCallRoom(roomId);
  };

  // --- HESAP FONKSİYONLARI ---
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
    if (allUsers.some(u => u.username === cleanUser)) return showNotification(`@${cleanUser} zaten alınmış!`, "error");

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
      showNotification(`Hesabınız oluşturuldu. Hoş geldin!`, "success");
    } catch (error) { showNotification("Kayıt hatası.", "error"); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim().toLowerCase().replace(/\s+/g, '');
    if (!cleanUser || !passwordInput) return showNotification("Kullanıcı adı ve şifre gereklidir.", "warning");
    const foundUser = allUsers.find(u => u.username === cleanUser && u.password === passwordInput);
    
    if (foundUser) {
      if (foundUser.banned) return showNotification("Hesap yasaklanmıştır!", "error");
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.uid), { status: 'online' });
        await saveAccountToDevice(foundUser);
        setUsernameInput(''); setPasswordInput('');
        showNotification(`Tekrar hoş geldin, ${foundUser.displayName}!`, "success");
      } catch (err) { showNotification("Giriş hatası.", "error"); }
    } else { showNotification("Kullanıcı adı veya şifre hatalı!", "error"); }
  };

  const handleQuickLogin = async (accountUid) => {
    if (!user) return;
    const targetUser = allUsers.find(u => u.uid === accountUid);
    if (targetUser?.banned) return showNotification("Bu hesap yasaklanmıştır!", "error");
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', accountUid), { status: 'online' });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid), { profileUid: accountUid, status: 'active' });
      setShowProfileModal(false); showNotification("Geçiş yapıldı.", "success");
    } catch (err) { showNotification("Geçiş yapılamadı.", "error"); }
  };

  const handleLogout = async () => {
    if (!user) return;
    try {
      if (currentUserProfile) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { status: 'offline' });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid), { status: 'logged_out' });
      setShowProfileModal(false); setStatusMenuOpen(false); setUsernameInput(''); setPasswordInput('');
      showNotification("Çıkış yapıldı.", "info");
    } catch (err) {}
  };

  const handleDeleteAccount = async () => {
    if (!currentUserProfile) return;
    if (!window.confirm("Hesabınızı kalıcı olarak silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid));
      await handleLogout(); showNotification("Hesap silindi.", "success");
    } catch (err) { showNotification("Hata.", "error"); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!currentUserProfile || !user) return;
    try {
      let finalAvatar = editAvatarUrl.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUserProfile.username)}`;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { displayName: editDisplayName.trim() || currentUserProfile.displayName, avatar: finalAvatar });
      setShowProfileModal(false); showNotification("Güncellendi!", "success");
    } catch (err) {}
  };

  const toggleHideDM = async (e, friendUid, isHiding) => {
    e.stopPropagation();
    if (!currentUserProfile) return;
    try {
      if (isHiding) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { hiddenDMs: arrayUnion(friendUid) });
        showNotification("Sohbet gizlendi.", "info");
        if (activeDmRecipient?.uid === friendUid) setActiveDmRecipient(null);
      }
    } catch (err) {}
  };

  const handleBlockUser = async (targetUid) => {
    if (!currentUserProfile) return;
    if (!window.confirm("Engellemek istiyor musunuz?")) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { blockedUsers: arrayUnion(targetUid) });
      showNotification("Engellendi.", "success");
      if (activeDmRecipient?.uid === targetUid) setActiveDmRecipient(null);
    } catch (err) {}
  };

  const selectChannelOrDm = async (type, data) => {
    if (type === 'dm') {
      setActiveDmRecipient(data); setActiveTab('home'); setShowMembersList(false);
      if (currentUserProfile?.hiddenDMs?.includes(data.uid)) {
        try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { hiddenDMs: arrayRemove(data.uid) }); } catch (error) {}
      }
    } else if (type === 'channel') setActiveChannelId(data);
    setIsMobileMenuOpen(false);
  };

  const handleAdminDeleteUser = async (targetUid) => {
    if (!window.confirm("Kalıcı silmek istiyor musunuz?")) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid)); showNotification("Silindi.", "success"); } catch (err) {}
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentUserProfile) return;
    if (activeTab === 'home' && activeDmRecipient && activeDmRecipient.blockedUsers?.includes(currentUserProfile.uid)) return showNotification("Engellisiniz.", "error");
    try {
      const isServer = activeTab.startsWith('server-');
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        serverId: isServer ? activeTab.replace('server-', '') : 'dm',
        channelId: isServer ? activeChannelId : activeDmRecipient.uid,
        senderId: currentUserProfile.uid, senderUsername: currentUserProfile.username, senderDisplayName: currentUserProfile.displayName, senderAvatar: currentUserProfile.avatar,
        text: messageText.trim(), timestamp: Date.now(), deletedFor: [] 
      });
      setMessageText('');
    } catch (err) {}
  };

  const getUnreadCount = (contextId) => {
    if (!currentUserProfile) return 0;
    const lastReadTime = currentUserProfile.lastRead?.[contextId] || 0;
    return allMessages.filter(m => (m.serverId === contextId || (m.serverId === 'dm' && m.senderId === contextId)) && m.timestamp > lastReadTime && m.senderId !== currentUserProfile.uid).length;
  };

  // --- HAFIZA SIRALAMALARI ---
  const myFriendsList = useMemo(() => allUsers.filter(u => currentUserProfile?.friends?.includes(u.uid) && !currentUserProfile?.blockedUsers?.includes(u.uid)), [allUsers, currentUserProfile]);
  const sidebarDmList = useMemo(() => {
    let friends = allUsers.filter(u => currentUserProfile?.friends?.includes(u.uid) && !currentUserProfile?.blockedUsers?.includes(u.uid));
    friends.sort((a, b) => {
      const msgsA = allMessages.filter(m => m.serverId === 'dm' && (m.channelId === a.uid || m.senderId === a.uid));
      const msgsB = allMessages.filter(m => m.serverId === 'dm' && (m.channelId === b.uid || m.senderId === b.uid));
      return (msgsB.pop()?.timestamp || 0) - (msgsA.pop()?.timestamp || 0);
    });
    return friends.filter(f => !currentUserProfile?.hiddenDMs?.includes(f.uid) || getUnreadCount(f.uid) > 0 || activeDmRecipient?.uid === f.uid);
  }, [allUsers, currentUserProfile, allMessages, activeDmRecipient]);
  
  const sortedServersList = useMemo(() => {
    let servers = allServers.filter(s => !s.members || s.members.includes(currentUserProfile?.uid));
    return servers.sort((a, b) => (allMessages.filter(m => m.serverId === b.id).pop()?.timestamp || 0) - (allMessages.filter(m => m.serverId === a.id).pop()?.timestamp || 0));
  }, [allServers, currentUserProfile, allMessages]);

  const activeChatMessages = useMemo(() => {
    let msgs = activeTab.startsWith('server-') ? allMessages.filter(m => m.serverId === activeTab.replace('server-', '') && m.channelId === activeChannelId) : allMessages.filter(m => m.serverId === 'dm' && ((m.senderId === currentUserProfile?.uid && m.channelId === activeDmRecipient?.uid) || (m.senderId === activeDmRecipient?.uid && m.channelId === currentUserProfile?.uid)));
    return msgs.filter(m => !(m.deletedFor?.includes(currentUserProfile?.uid)) && !currentUserProfile?.blockedUsers?.includes(m.senderId));
  }, [allMessages, activeTab, activeChannelId, activeDmRecipient, currentUserProfile]);
  
  const activeServer = activeTab.startsWith('server-') ? allServers.find(s => s.id === activeTab.replace('server-', '')) : null;

  if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-[#09090b]"><div className="w-12 h-12 border-4 border-indigo-500 rounded-full animate-spin"></div></div>;
  if (!currentUserProfile) { /* Login ekranı kısaltıldı (orijinal sistem aktif, görsel olarak yer kaplamaması için sıkıştırıldı) */
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#09090b] text-zinc-100">
        <div className="absolute top-4 z-50 flex flex-col gap-2">{notifications.map(n => <div key={n.id} className="px-4 py-3 rounded-xl shadow-xl text-sm border border-white/10 bg-[#18181b]/90">{n.message}</div>)}</div>
        <div className="w-full max-w-md bg-[#121214] p-8 rounded-[2rem] shadow-2xl">
          <h2 className="text-3xl font-black text-center mb-6">NEXUS</h2>
          <div className="flex bg-[#18181b] rounded-xl p-1 mb-6">
            <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg text-sm ${authMode === 'login' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Giriş</button>
            <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg text-sm ${authMode === 'register' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Kayıt</button>
          </div>
          <form onSubmit={authMode === 'register' ? handleRegister : handleLogin} className="space-y-4">
            {authMode === 'register' && <input type="text" value={displayNameInput} onChange={e => setDisplayNameInput(e.target.value)} placeholder="Görünür İsim" className="w-full bg-[#18181b] p-3 rounded-xl text-white outline-none" required />}
            <input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Kullanıcı Adı" className="w-full bg-[#18181b] p-3 rounded-xl text-white outline-none lowercase" required />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Şifre" className="w-full bg-[#18181b] p-3 rounded-xl text-white outline-none" required />
            <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">{authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-[#09090b] text-zinc-100 relative">
      <div className="absolute top-4 right-4 z-[100] flex flex-col gap-2">{notifications.map(n => <div key={n.id} className="px-4 py-3 rounded-xl shadow-xl text-sm border border-white/10 bg-[#18181b]/95"><span className={n.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}>{n.message}</span></div>)}</div>
      
      {/* SOL MENÜ */}
      <div className={`fixed md:relative z-40 flex h-full transition-transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="w-[80px] bg-[#0f0f13] flex flex-col items-center py-4 gap-3 border-r border-white/5 overflow-y-auto no-scrollbar">
          <button onClick={() => { setActiveTab('home'); setActiveDmRecipient(null); setIsMobileMenuOpen(false); }} className={`w-12 h-12 rounded-2xl flex items-center justify-center ${activeTab === 'home' ? 'bg-indigo-600 text-white' : 'bg-[#18181b] text-zinc-400'}`}>🏠</button>
          <div className="w-8 h-[2px] bg-white/5" />
          {sortedServersList.map(server => (
            <button key={server.id} onClick={() => { setActiveTab(`server-${server.id}`); setActiveChannelId(server.channels[0]?.id || 'genel'); }} className={`w-12 h-12 rounded-2xl relative ${activeTab === `server-${server.id}` ? 'bg-indigo-600 text-white' : 'bg-[#18181b] text-zinc-400'}`}>
              {server.icon}
              {getUnreadCount(server.id) > 0 && <span className="absolute -bottom-1 -right-1 bg-rose-500 text-[10px] px-1.5 rounded-full">{getUnreadCount(server.id)}</span>}
            </button>
          ))}
        </div>
        
        <div className="w-[240px] bg-[#121214] flex flex-col h-full border-r border-white/5">
          <div className="h-14 flex items-center px-4 font-bold border-b border-white/5">{activeTab === 'home' ? 'Merkez' : activeServer?.name}</div>
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {activeTab === 'home' ? (
              <>
                <button onClick={() => setHomeSubTab('friends')} className="w-full text-left px-3 py-2 rounded-xl text-zinc-400 hover:bg-white/5">Bağlantılarım</button>
                {isAdmin && <button onClick={() => setHomeSubTab('admin')} className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:bg-white/5 border border-rose-500/30 mt-2">👑 Yönetici Paneli</button>}
                <div className="pt-4 text-[10px] font-bold text-zinc-500 uppercase px-3">Direkt Mesajlar</div>
                {sidebarDmList.map(friend => (
                  <div key={friend.uid} className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer ${activeDmRecipient?.uid === friend.uid ? 'bg-white/10' : 'hover:bg-white/5'}`} onClick={() => selectChannelOrDm('dm', friend)}>
                    <div className="flex items-center gap-3">
                      <div className="relative"><img src={friend.avatar} className="w-8 h-8 rounded-full" /><span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#121214] ${friend.status === 'online' ? 'bg-emerald-400' : 'bg-zinc-500'}`} /></div>
                      <span className="text-[13px] font-bold truncate">{friend.displayName}</span>
                    </div>
                    <button onClick={(e) => toggleHideDM(e, friend.uid, true)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500">X</button>
                  </div>
                ))}
              </>
            ) : (
              activeServer?.channels.map(channel => (
                <button key={channel.id} onClick={() => selectChannelOrDm('channel', channel.id)} className={`w-full text-left px-3 py-2 rounded-xl ${activeChannelId === channel.id ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400'}`}># {channel.name}</button>
              ))
            )}
          </div>
          <div className="h-16 bg-[#0a0a0c] px-3 flex items-center justify-between border-t border-white/5">
            <div className="flex items-center gap-2"><img src={currentUserProfile.avatar} className="w-9 h-9 rounded-full" /><div className="text-sm font-bold truncate">{currentUserProfile.displayName}</div></div>
            <button onClick={() => setShowProfileModal(true)} className="text-zinc-400">⚙️</button>
          </div>
        </div>
      </div>

      {/* ANA İÇERİK */}
      <div className="flex-1 flex flex-col bg-[#161619] relative min-w-0">
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden text-white">☰</button>
            <span className="font-bold text-lg">{activeTab === 'home' && activeDmRecipient ? activeDmRecipient.displayName : activeTab === 'home' ? 'Merkez' : `# ${activeServer?.channels.find(c => c.id === activeChannelId)?.name}`}</span>
          </div>
          
          {/* ÜST SAĞ MENÜ (ARAMA İKONU) */}
          <div className="flex items-center gap-3">
            {(activeTab.startsWith('server-') || activeDmRecipient) && (
              <button onClick={startVoiceCall} className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-emerald-500/30 transition-all">
                📞 Sesli/Görüntülü Ara
              </button>
            )}
            {activeTab.startsWith('server-') && <button onClick={() => setShowMembersList(!showMembersList)} className="p-2 text-zinc-400 hover:text-white">👥 Üyeler</button>}
          </div>
        </div>

        {/* JITSI ARAMA EKRANI (AÇILIRSA ANA MESAJLAŞMAYI KAPLAR) */}
        {activeCallRoom ? (
          <div className="flex-1 relative flex flex-col bg-black">
            <div className="absolute top-4 left-4 z-50">
              <button onClick={() => setActiveCallRoom(null)} className="px-4 py-2 bg-rose-600 text-white font-bold rounded-lg shadow-lg hover:bg-rose-500">Aramayı Kapat / Ayrıl</button>
            </div>
            <iframe 
              src={`https://meet.jit.si/${activeCallRoom}#config.startWithVideo=false`} 
              allow="camera; microphone; fullscreen; display-capture"
              className="w-full h-full border-0"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex z-10 relative">
            <div className="flex-1 flex flex-col min-w-0">
              {activeTab === 'home' && !activeDmRecipient ? (
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                  {/* ADMIN PANELI */}
                  {homeSubTab === 'admin' && isAdmin && (
                    <div className="space-y-3">
                      {allUsers.map(u => (
                        <div key={u.uid} className="bg-[#1c1c21] p-4 rounded-xl border border-white/5 flex justify-between items-center">
                          <div className="flex items-center gap-3"><img src={u.avatar} className="w-10 h-10 rounded-full" /><div><div className="font-bold">{u.displayName}</div><div className="text-xs text-amber-400 font-mono">Şifre: {u.password}</div></div></div>
                          <div className="flex gap-2">
                            <button onClick={() => handleQuickLogin(u.uid)} className="px-3 py-1 bg-purple-600 rounded text-xs font-bold">Hesaba Gir</button>
                            <button onClick={() => handleAdminDeleteUser(u.uid)} className="px-3 py-1 bg-rose-600 rounded text-xs font-bold">Sil</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* BAĞLANTILARIM */}
                  {homeSubTab === 'friends' && myFriendsList.map(friend => (
                    <div key={friend.uid} className="flex justify-between items-center p-4 bg-[#1c1c21] rounded-xl mb-2 border border-white/5">
                      <div className="flex items-center gap-3"><img src={friend.avatar} className="w-10 h-10 rounded-full" /><span className="font-bold">{friend.displayName}</span></div>
                      <button onClick={() => selectChannelOrDm('dm', friend)} className="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold">Mesaj Yaz</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {activeChatMessages.map(msg => (
                      <div key={msg.id} className="flex gap-3 group relative">
                        <img src={msg.senderAvatar} className="w-9 h-9 rounded-full object-cover shrink-0" />
                        <div>
                          <div className="flex gap-2 items-baseline">
                            <span className={`text-[13px] font-bold ${msg.senderId === currentUserProfile?.uid ? 'text-indigo-400' : 'text-zinc-100'}`}>{msg.senderDisplayName}</span>
                            <span className="text-[10px] text-zinc-500">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          {msg.text && <p className="text-sm text-zinc-300 break-words">{msg.text}</p>}
                          
                          {/* DOSYA GÖSTERİM ALANI */}
                          {msg.fileUrl && (
                            <div className="mt-2">
                              {msg.fileType?.startsWith('image/') ? (
                                <img src={msg.fileUrl} alt="Görsel" className="max-w-xs md:max-w-md rounded-xl border border-white/10" />
                              ) : msg.fileType?.startsWith('video/') ? (
                                <video src={msg.fileUrl} controls className="max-w-xs md:max-w-md rounded-xl border border-white/10" />
                              ) : msg.fileType?.startsWith('audio/') ? (
                                <audio src={msg.fileUrl} controls className="w-full max-w-xs outline-none" />
                              ) : (
                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/10 w-max text-sm text-indigo-400 font-bold">
                                  📄 {msg.fileName}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* MESAJ YAZMA VE DOSYA YÜKLEME KUTUSU */}
                  <div className="p-3 bg-[#161619] border-t border-white/5 relative">
                    {isUploading && (
                      <div className="absolute -top-8 left-0 w-full px-4 flex items-center gap-2 text-xs font-bold text-indigo-400">
                        <span>Yükleniyor... %{uploadProgress}</span>
                        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}
                    <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-[#1c1c21] hover:bg-white/10 border border-white/10 rounded-2xl text-zinc-400 hover:text-white transition-all" title="Dosya Ekle">
                        📎
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                      
                      <input type="text" value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="Mesaj yaz..." className="flex-1 bg-[#1c1c21] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none" />
                      <button type="submit" disabled={!messageText.trim()} className="p-3 bg-indigo-600 rounded-2xl text-white disabled:opacity-50">🚀</button>
                    </form>
                  </div>
                </div>
              )}
            </div>
            
            {activeTab.startsWith('server-') && showMembersList && (
              <div className="w-[200px] bg-[#121214] border-l border-white/5 p-3 overflow-y-auto">
                <div className="text-[10px] font-bold text-zinc-500 mb-2">ÜYELER</div>
                {allUsers.filter(u => activeServer?.members?.includes(u.uid)).map(u => (
                  <div key={u.uid} className="flex items-center gap-2 mb-2"><img src={u.avatar} className="w-6 h-6 rounded-full" /><span className="text-xs truncate">{u.displayName}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[200]">
          <div className="bg-[#121214] p-6 rounded-3xl w-full max-w-sm"><button onClick={handleLogout} className="w-full py-3 bg-rose-600 rounded-xl font-bold mt-4">Çıkış Yap</button><button onClick={() => setShowProfileModal(false)} className="w-full py-3 bg-zinc-800 rounded-xl font-bold mt-2">Kapat</button></div>
        </div>
      )}
    </div>
  );
}