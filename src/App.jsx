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
  const [showMembersList, setShowMembersList] = useState(false); // Sunucu Üye Listesi Paneli
  
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

  // OKUNMUŞ MESAJ SİSTEMİ (Son Görülme Güncellemesi)
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
        await saveAccountToDevice(foundUser);
        setUsernameInput(''); setPasswordInput('');
        showNotification(`Tekrar hoş geldin, ${foundUser.displayName}!`, "success");
      } catch (err) { showNotification("Giriş yapılırken hata oluştu.", "error"); }
    } else { showNotification("Kullanıcı adı veya şifre hatalı!", "error"); }
  };

  const handleQuickLogin = async (accountUid) => {
    if (!user) return;
    const targetUser = allUsers.find(u => u.uid === accountUid);
    if (targetUser?.banned) return showNotification("Bu hesap sistemden yasaklanmıştır!", "error");
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid), { profileUid: accountUid, status: 'active' });
      setShowProfileModal(false); showNotification("Hesaba geçiş yapıldı.", "success");
    } catch (err) { showNotification("Geçiş yapılamadı.", "error"); }
  };

  const handleLogout = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid), { status: 'logged_out' });
      setShowProfileModal(false); setStatusMenuOpen(false); setUsernameInput(''); setPasswordInput(''); setDisplayNameInput('');
      showNotification("Hesabınızdan çıkış yapıldı.", "info");
    } catch (err) {}
  };

  const handleDeleteAccount = async () => {
    if (!currentUserProfile) return;
    if (!window.confirm("DİKKAT: Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid));
      await handleLogout();
      showNotification("Hesabınız kalıcı olarak silindi.", "success");
    } catch (err) { showNotification("Hesap silinemedi.", "error"); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!currentUserProfile || !user) return;
    try {
      let finalAvatar = editAvatarUrl.trim();
      if (!finalAvatar) finalAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUserProfile.username)}`;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), {
        displayName: editDisplayName.trim() || currentUserProfile.displayName, avatar: finalAvatar
      });
      setShowProfileModal(false); showNotification("Profiliniz başarıyla güncellendi!", "success");
      const updatedSaved = savedAccounts.map(acc => acc.uid === currentUserProfile.uid ? { ...acc, displayName: editDisplayName.trim(), avatar: finalAvatar } : acc);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid), { savedAccounts: updatedSaved });
    } catch (err) {}
  };

  const handleStatusChange = async (newStatus) => {
    if (!currentUserProfile) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { status: newStatus });
    setStatusMenuOpen(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showNotification("Lütfen resim dosyası seçin.", "error");
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256; let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
        setEditAvatarUrl(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // KİŞİ ENGELLEME VE GİZLEME (X BUTONU)
  const toggleHideDM = async (e, friendUid, isHiding) => {
    e.stopPropagation();
    if (!currentUserProfile) return;
    try {
      if (isHiding) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { hiddenDMs: arrayUnion(friendUid) });
        showNotification("Kişi sohbet listesinden gizlendi.", "info");
        if (activeDmRecipient?.uid === friendUid) { setActiveDmRecipient(null); }
      }
    } catch (err) {}
  };

  const handleBlockUser = async (targetUid) => {
    if (!currentUserProfile) return;
    if (!window.confirm("Bu kişiyi engellemek istediğine emin misin? Artık sana mesaj atamayacak.")) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { blockedUsers: arrayUnion(targetUid) });
      showNotification("Kullanıcı engellendi.", "success");
      if (activeDmRecipient?.uid === targetUid) setActiveDmRecipient(null);
    } catch (err) {}
  };

  const selectChannelOrDm = (type, data) => {
    if (type === 'dm') { setActiveDmRecipient(data); setActiveTab('home'); } 
    else if (type === 'channel') { setActiveChannelId(data); }
    setIsMobileMenuOpen(false);
  };

  // GLOBAL ADMİN FONKSİYONLARI
  const handleSetRank = async (targetUid) => {
    const rName = document.getElementById(`rankName-${targetUid}`).value.trim();
    const rColor = document.getElementById(`rankColor-${targetUid}`).value;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid), { rankName: rName, rankColor: rName ? rColor : null });
      showNotification("Rütbe başarıyla atandı!", "success");
    } catch(err) {}
  };
  const handleBanUser = async (targetUid) => {
    if (!window.confirm("Bu kullanıcıyı tamamen banlamak istediğine emin misin?")) return;
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid), { banned: true }); showNotification("Kullanıcı banlandı.", "success"); } catch(err) {}
  };
  const handleUnbanUser = async (targetUid) => {
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid), { banned: false }); showNotification("Kullanıcının banı kaldırıldı.", "info"); } catch(err) {}
  };

  // SUNUCU İÇİ ROL VERME (SADECE KURUCU İÇİN)
  const handleSetServerRole = async (targetUid) => {
    if (!activeServer || activeServer.ownerId !== currentUserProfile?.uid) return;
    const rName = document.getElementById(`serverRankName-${targetUid}`).value.trim();
    const rColor = document.getElementById(`serverRankColor-${targetUid}`).value;
    try {
      const updatedRoles = activeServer.memberRoles || {};
      if (rName) { updatedRoles[targetUid] = { name: rName, color: rColor }; } 
      else { delete updatedRoles[targetUid]; }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'servers', activeServer.id), { memberRoles: updatedRoles });
      showNotification("Sunucu rolü başarıyla atandı!", "success");
    } catch (err) {}
  };

  // SUNUCU İŞLEMLERİ
  const handleCreateServer = async (e) => {
    e.preventDefault();
    if (!newServerName.trim() || !currentUserProfile) return;
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'servers'), {
        name: newServerName.trim(), icon: newServerName.trim().substring(0, 2).toUpperCase(),
        ownerId: currentUserProfile.uid, channels: [{ id: 'genel', name: 'genel' }],
        inviteCode: inviteCode, members: [currentUserProfile.uid], memberRoles: {}
      });
      setNewServerName(''); setShowNewServerModal(false);
      setActiveTab(`server-${docRef.id}`); setActiveChannelId('genel');
      setIsMobileMenuOpen(false); showNotification("Sunucu oluşturuldu!", "success");
    } catch (err) {}
  };
  const handleJoinServer = async (e) => {
    e.preventDefault();
    const code = joinInviteCode.trim().toUpperCase();
    if (!code || !currentUserProfile) return;
    const serverToJoin = allServers.find(s => s.inviteCode === code);
    if (!serverToJoin) return showNotification("Böyle bir davet kodu bulunamadı!", "error");
    if (serverToJoin.members?.includes(currentUserProfile.uid)) return showNotification("Zaten bu ağın içerisindesin!", "warning");
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'servers', serverToJoin.id), { members: [...(serverToJoin.members || []), currentUserProfile.uid] });
      setShowJoinServerModal(false); setJoinInviteCode('');
      showNotification("Ağa katıldın!", "success"); setActiveTab(`server-${serverToJoin.id}`); setActiveChannelId(serverToJoin.channels[0]?.id || 'genel');
      setIsMobileMenuOpen(false);
    } catch(err) {}
  };
  const handleDeleteServer = async () => {
    if (!activeServer || activeServer.ownerId !== currentUserProfile?.uid) return;
    if (!window.confirm(`Ağı tamamen silmek istediğinize emin misiniz?`)) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'servers', activeServer.id));
      setActiveTab('home'); setActiveChannelId('genel'); showNotification("Ağ silindi.", "success");
    } catch (err) {}
  };
  const handleCreateChannel = async (e) => {
    e.preventDefault();
    const chName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!chName) return;
    const sId = activeTab.replace('server-', ''); const server = allServers.find(s => s.id === sId);
    if (!server || server.channels.some(c => c.name === chName)) return;
    try {
      const newCh = { id: crypto.randomUUID(), name: chName };
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'servers', sId), { channels: [...server.channels, newCh] });
      setNewChannelName(''); setShowNewChannelModal(false); selectChannelOrDm('channel', newCh.id);
    } catch (err) {}
  };

  // MESAJ İŞLEMLERİ
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentUserProfile) return;
    
    // Engelleme Kontrolü
    if (activeTab === 'home' && activeDmRecipient) {
      if (activeDmRecipient.blockedUsers?.includes(currentUserProfile.uid)) return showNotification("Bu kullanıcıya mesaj gönderemezsiniz.", "error");
    }

    try {
      const isServer = activeTab.startsWith('server-');
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        serverId: isServer ? activeTab.replace('server-', '') : 'dm',
        channelId: isServer ? activeChannelId : activeDmRecipient.uid,
        senderId: currentUserProfile.uid,
        senderUsername: currentUserProfile.username, 
        senderDisplayName: currentUserProfile.displayName,
        senderAvatar: currentUserProfile.avatar,
        text: messageText.trim(), timestamp: Date.now(), deletedFor: [] 
      });
      setMessageText('');
    } catch (err) {}
  };

  const handleDeleteForMe = async (msgId) => { try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'messages', msgId), { deletedFor: arrayUnion(currentUserProfile.uid) }); } catch (err) {} };
  const handleDeleteForAll = async (msgId) => { if (!window.confirm("Herkesten silmek istediğine emin misin?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'messages', msgId)); } catch (err) {} };
  const handleEditMessage = async (e) => {
    e.preventDefault(); if (!editMessageText.trim() || !editingMessageId) return;
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'messages', editingMessageId), { text: editMessageText.trim(), isEdited: true }); setEditingMessageId(null); setEditMessageText(''); } catch (err) {}
  };

  // ARKADAŞLIK SİSTEMİ
  const sendFriendRequest = async (targetUser) => {
    if (!currentUserProfile) return;
    if (targetUser.blockedUsers?.includes(currentUserProfile.uid) || currentUserProfile.blockedUsers?.includes(targetUser.uid)) return showNotification("Bu kullanıcıyla etkileşime geçilemez.", "error");
    const isAlreadyFriend = currentUserProfile.friends?.includes(targetUser.uid);
    const hasPendingReq = allFriendRequests.some(r => (r.fromUid === currentUserProfile.uid && r.toUid === targetUser.uid) || (r.fromUid === targetUser.uid && r.toUid === currentUserProfile.uid));
    if (isAlreadyFriend || hasPendingReq) return showNotification("Zaten arkadaşsınız veya bekleyen bir istek var!", "warning");
    
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'friend_requests'), {
      fromUid: currentUserProfile.uid, fromUsername: currentUserProfile.username, fromDisplayName: currentUserProfile.displayName,
      toUid: targetUser.uid, toUsername: targetUser.username, toDisplayName: targetUser.displayName, status: 'pending', timestamp: Date.now()
    });
    showNotification("İstek iletildi!", "success");
  };
  const acceptFriendRequest = async (request) => {
    if (!currentUserProfile) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'friend_requests', request.id), { status: 'accepted' });
    const myFriends = currentUserProfile.friends || [];
    if (!myFriends.includes(request.fromUid)) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { friends: [...myFriends, request.fromUid] });
    const otherFriends = allUsers.find(u => u.uid === request.fromUid)?.friends || [];
    if (!otherFriends.includes(currentUserProfile.uid)) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', request.fromUid), { friends: [...otherFriends, currentUserProfile.uid] });
  };
  const declineFriendRequest = async (request) => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'friend_requests', request.id)); };

  // --- OKUNMAMIŞ MESAJ SAYACI FONKSİYONU ---
  const getUnreadCount = (contextId) => {
    if (!currentUserProfile) return 0;
    const lastReadTime = currentUserProfile.lastRead?.[contextId] || 0;
    return allMessages.filter(m => (m.serverId === contextId || (m.serverId === 'dm' && m.senderId === contextId)) && m.timestamp > lastReadTime && m.senderId !== currentUserProfile.uid).length;
  };

  // --- HESAPLAMALAR VE AKILLI SIRALAMALAR ---
  const filteredSearchUsers = useMemo(() => allUsers.filter(u => u.uid !== currentUserProfile?.uid && !currentUserProfile?.blockedUsers?.includes(u.uid) && !u.blockedUsers?.includes(currentUserProfile?.uid) && (u.username.includes(searchQuery.toLowerCase()) || u.displayName.toLowerCase().includes(searchQuery.toLowerCase()))), [allUsers, searchQuery, currentUserProfile]);
  
  const friendRequests = useMemo(() => ({
    received: allFriendRequests.filter(r => r.toUid === currentUserProfile?.uid && r.status === 'pending'),
    sent: allFriendRequests.filter(r => r.fromUid === currentUserProfile?.uid && r.status === 'pending')
  }), [allFriendRequests, currentUserProfile]);
  
  // DM Sıralaması: En son mesaj atılan/gelen en üstte.
  const myFriendsList = useMemo(() => {
    let friends = allUsers.filter(u => currentUserProfile?.friends?.includes(u.uid) && !currentUserProfile?.blockedUsers?.includes(u.uid));
    
    // Mesaj saatine göre sırala
    friends.sort((a, b) => {
      const lastA = allMessages.filter(m => m.serverId === 'dm' && (m.channelId === a.uid || m.senderId === a.uid)).pop()?.timestamp || 0;
      const lastB = allMessages.filter(m => m.serverId === 'dm' && (m.channelId === b.uid || m.senderId === b.uid)).pop()?.timestamp || 0;
      return lastB - lastA;
    });

    // Gizli olanları filtrele (Ama okunmamış mesajı varsa gizli olsa bile göster!)
    return friends.filter(f => {
      const isHidden = currentUserProfile?.hiddenDMs?.includes(f.uid);
      const unreadCount = getUnreadCount(f.uid);
      return !isHidden || unreadCount > 0;
    });
  }, [allUsers, currentUserProfile, allMessages]);

  // Sunucu Sıralaması: En son mesaj atılan sunucu en üstte
  const sortedServersList = useMemo(() => {
    if (!currentUserProfile) return [];
    let servers = allServers.filter(s => !s.members || s.members.includes(currentUserProfile.uid));
    
    return servers.sort((a, b) => {
      const lastA = allMessages.filter(m => m.serverId === a.id).pop()?.timestamp || 0;
      const lastB = allMessages.filter(m => m.serverId === b.id).pop()?.timestamp || 0;
      return lastB - lastA;
    });
  }, [allServers, currentUserProfile, allMessages]);

  const activeChatMessages = useMemo(() => {
    let msgs = [];
    if (activeTab.startsWith('server-')) msgs = allMessages.filter(m => m.serverId === activeTab.replace('server-', '') && m.channelId === activeChannelId);
    if (activeTab === 'home' && activeDmRecipient) msgs = allMessages.filter(m => m.serverId === 'dm' && ((m.senderId === currentUserProfile?.uid && m.channelId === activeDmRecipient.uid) || (m.senderId === activeDmRecipient.uid && m.channelId === currentUserProfile?.uid)));
    
    return msgs.filter(m => !(m.deletedFor && m.deletedFor.includes(currentUserProfile?.uid)) && !currentUserProfile?.blockedUsers?.includes(m.senderId));
  }, [allMessages, activeTab, activeChannelId, activeDmRecipient, currentUserProfile]);
  
  const activeServer = activeTab.startsWith('server-') ? allServers.find(s => s.id === activeTab.replace('server-', '')) : null;

  // RENDER - YÜKLENİYOR
  if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-[#09090b]"><div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div></div>;

  // YASAKLI KULLANICI
  if (currentUserProfile && currentUserProfile.banned) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#09090b] text-white font-sans p-4 text-center">
        <div className="text-7xl mb-6 drop-shadow-[0_0_20px_rgba(244,63,94,0.6)]">🔨</div>
        <h1 className="text-4xl font-black text-rose-500 mb-3 tracking-widest">HESABINIZ YASAKLANDI</h1>
        <p className="text-zinc-400 max-w-md mb-8 leading-relaxed">Platform kurallarını ihlal ettiğiniz tespit edildi. NEXUS ağına erişiminiz kapatılmıştır.</p>
        <button onClick={handleLogout} className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-all shadow-lg">Çıkış Yap</button>
      </div>
    );
  }

  // KAYIT / GİRİŞ
  if (!currentUserProfile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#09090b] relative font-sans text-zinc-100 overflow-hidden px-4">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-4 left-4 right-4 md:right-6 md:left-auto md:w-80 z-50 flex flex-col gap-2">
          {notifications.map(n => (<div key={n.id} className="px-4 py-3 rounded-xl shadow-xl text-sm border border-white/10 backdrop-blur-md flex items-center gap-2 bg-[#18181b]/90 animate-bounce"><span className={n.type === 'error' ? 'text-rose-400' : 'text-emerald-400 font-medium'}>{n.message}</span></div>))}
        </div>
        <div className="relative w-full max-w-md bg-[#121214]/80 backdrop-blur-xl border border-white/5 p-6 sm:p-8 rounded-[2rem] shadow-2xl z-10">
          <h2 className="text-3xl font-black text-center text-white tracking-widest mb-6">NEXUS</h2>
          {authMode === 'saved' && savedAccounts.length > 0 ? (
            <div className="animate-in fade-in zoom-in-95 duration-300">
              <p className="text-xs text-zinc-400 text-center mb-4 uppercase tracking-widest font-bold">Kayıtlı Hesaplar</p>
              <div className="space-y-3 mb-6">
                {savedAccounts.map(acc => (
                  <div key={acc.uid} onClick={() => handleQuickLogin(acc.uid)} className="group flex items-center gap-4 p-3 bg-[#18181b] border border-white/5 hover:border-indigo-500/50 hover:bg-white/5 rounded-2xl cursor-pointer transition-all">
                    <img src={acc.avatar} className="w-12 h-12 rounded-full object-cover bg-zinc-800" />
                    <div className="flex-1 min-w-0"><p className="font-bold text-white truncate">{acc.displayName}</p><p className="text-xs text-zinc-400 truncate group-hover:text-indigo-400">@{acc.username}</p></div>
                  </div>
                ))}
              </div>
              <button onClick={() => setAuthMode('login')} className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-all mb-3">Başka Hesaba Giriş Yap</button>
              <button onClick={() => setAuthMode('register')} className="w-full py-3.5 border border-white/10 hover:bg-white/5 text-zinc-300 rounded-xl text-sm font-bold transition-all">Yeni Hesap Oluştur</button>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <div className="flex bg-[#18181b] rounded-xl p-1 mb-6 border border-white/5">
                <button onClick={() => setAuthMode('login')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${authMode === 'login' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Giriş Yap</button>
                <button onClick={() => setAuthMode('register')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${authMode === 'register' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Kayıt Ol</button>
              </div>
              <form onSubmit={authMode === 'register' ? handleRegister : handleLogin} className="space-y-4">
                {authMode === 'register' && (<div><label className="block text-[10px] font-bold text-zinc-500 mb-1">Görünür İsim</label><input type="text" value={displayNameInput} onChange={e => setDisplayNameInput(e.target.value)} className="w-full bg-[#18181b]/50 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:border-indigo-500/50 outline-none" required /></div>)}
                <div><label className="block text-[10px] font-bold text-zinc-500 mb-1">Kullanıcı Adı</label><input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} className="w-full bg-[#18181b]/50 border border-white/10 text-white rounded-xl px-4 py-3 text-sm lowercase focus:border-indigo-500/50 outline-none" required /></div>
                <div><label className="block text-[10px] font-bold text-zinc-500 mb-1">Şifre</label><input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="w-full bg-[#18181b]/50 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:border-indigo-500/50 outline-none" required /></div>
                <button type="submit" className="w-full mt-2 bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-500 transition-all">{authMode === 'login' ? 'Giriş Yap' : 'Hesabı Oluştur'}</button>
              </form>
              {savedAccounts.length > 0 && <button onClick={() => setAuthMode('saved')} className="w-full mt-4 text-xs font-bold text-indigo-400">← Geri</button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ANA UYGULAMA
  return (
    <div className="h-screen w-full flex flex-col md:flex-row overflow-hidden bg-[#09090b] text-zinc-100 font-sans relative [&_*::-webkit-scrollbar]:w-1.5 [&_*::-webkit-scrollbar-track]:bg-transparent [&_*::-webkit-scrollbar-thumb]:bg-zinc-800">
      
      <div className="absolute top-4 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (<div key={n.id} className="px-4 py-3 rounded-xl shadow-2xl text-sm border border-white/10 flex items-center bg-[#18181b]/95 animate-bounce pointer-events-auto"><span className={n.type === 'error' ? 'text-rose-400' : 'text-emerald-400 font-medium'}>{n.message}</span></div>))}
      </div>

      {isMobileMenuOpen && <div className="md:hidden fixed inset-0 bg-black/60 z-30" onClick={() => setIsMobileMenuOpen(false)}></div>}

      {/* --- SOL MENÜ (SUNUCULAR) --- */}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 flex h-full transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="w-[70px] md:w-[80px] bg-[#0f0f13] flex flex-col items-center py-4 gap-3 border-r border-white/5 z-20 overflow-hidden">
          
          <button onClick={() => { setActiveTab('home'); setActiveDmRecipient(null); setIsMobileMenuOpen(false); setShowMembersList(false); }} className={`relative group w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeTab === 'home' ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.6)]' : 'bg-[#18181b] text-zinc-400 hover:text-indigo-400'}`}>
            <div className={`absolute -left-3 md:-left-4 w-1.5 bg-indigo-500 rounded-r-full transition-all ${activeTab === 'home' ? 'h-8' : 'h-0 group-hover:h-4'}`} />
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          </button>
          
          <div className="w-8 h-[2px] bg-white/5 rounded-full my-1 shrink-0" />
          
          <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-3 no-scrollbar pb-4">
            {sortedServersList.map(server => {
              const unread = getUnreadCount(server.id);
              return (
                <button key={server.id} onClick={() => { setActiveTab(`server-${server.id}`); setActiveChannelId(server.channels[0]?.id || 'genel'); setShowMembersList(false); }} className={`relative group w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm transition-all shrink-0 ${activeTab === `server-${server.id}` ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.6)]' : 'bg-[#18181b] text-zinc-400 hover:text-white'}`}>
                  <div className={`absolute -left-3 md:-left-4 w-1.5 bg-indigo-500 rounded-r-full transition-all ${activeTab === `server-${server.id}` ? 'h-8' : 'h-0 group-hover:h-4'}`} />
                  <span>{server.icon}</span>
                  {unread > 0 && <span className="absolute -bottom-1 -right-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-[#0f0f13] shadow-md z-10">{unread > 99 ? '99+' : unread}</span>}
                </button>
              );
            })}
            <div className="w-8 h-[2px] bg-white/5 rounded-full my-1 shrink-0" />
            <button onClick={() => setShowNewServerModal(true)} className="w-12 h-12 shrink-0 rounded-2xl bg-[#18181b] border border-white/5 text-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button>
            <button onClick={() => setShowJoinServerModal(true)} className="w-12 h-12 shrink-0 rounded-2xl bg-[#18181b] border border-white/5 text-indigo-400 hover:bg-indigo-500/10 flex items-center justify-center transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg></button>
          </div>
        </div>

        {/* --- İKİNCİ SOL MENÜ (KANALLAR/DMLER) --- */}
        <div className="w-[240px] bg-[#121214] flex flex-col h-full border-r border-white/5 z-10">
          <div className="h-14 border-b border-white/5 flex items-center px-4 font-extrabold text-white/90 shadow-sm bg-[#121214]/80 backdrop-blur-md shrink-0">
            {activeTab === 'home' ? 'Merkez' : activeServer?.name}
          </div>
          
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {activeTab === 'home' ? (
              <>
                <button onClick={() => { setHomeSubTab('friends'); setActiveDmRecipient(null); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${homeSubTab === 'friends' && !activeDmRecipient ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/5'}`}>Bağlantılarım</button>
                <button onClick={() => { setHomeSubTab('add-friend'); setActiveDmRecipient(null); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${homeSubTab === 'add-friend' && !activeDmRecipient ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/5'}`}>Kişi Ara</button>
                <button onClick={() => { setHomeSubTab('requests'); setActiveDmRecipient(null); setIsMobileMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${homeSubTab === 'requests' && !activeDmRecipient ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/5'}`}>
                  <span>İstekler</span>
                  {friendRequests.received.length > 0 && <span className="bg-rose-500 text-white text-xs px-2 rounded-full font-bold">{friendRequests.received.length}</span>}
                </button>
                
                {isAdmin && (
                  <button onClick={() => { setHomeSubTab('admin'); setActiveDmRecipient(null); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all mt-4 border ${homeSubTab === 'admin' && !activeDmRecipient ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'text-zinc-400 hover:bg-white/5 border-transparent'}`}>
                    👑 Yönetici Paneli
                  </button>
                )}

                <div className="pt-4">
                  <div className="px-3 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 flex items-center justify-between">
                    <span>Direkt Mesajlar</span>
                  </div>
                  <div className="space-y-0.5">
                    {myFriendsList.map(friend => {
                      const unread = getUnreadCount(friend.uid);
                      return (
                        <div key={friend.uid} className={`group relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all cursor-pointer ${activeDmRecipient?.uid === friend.uid ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5'}`} onClick={() => selectChannelOrDm('dm', friend)}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="relative shrink-0">
                              <img src={friend.avatar} className="w-8 h-8 rounded-full bg-zinc-800 object-cover" />
                              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#121214] ${friend.status === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : friend.status === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'}`} />
                              {unread > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold px-1.5 h-4 min-w-[16px] flex items-center justify-center rounded-full border border-[#121214] shadow-md z-10">{unread > 99 ? '99+' : unread}</span>}
                            </div>
                            <span className="truncate font-bold text-[13px]">{friend.displayName}</span>
                          </div>
                          
                          {/* SOHBETİ GİZLE (X) BUTONU */}
                          <button onClick={(e) => toggleHideDM(e, friend.uid, true)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-white transition-all shrink-0" title="Sohbeti Gizle">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  <span>Kanallar</span>
                  {activeServer?.ownerId === currentUserProfile?.uid && (
                    <button onClick={() => setShowNewChannelModal(true)} className="hover:text-indigo-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg></button>
                  )}
                </div>
                {activeServer?.channels.map(channel => (
                  <button key={channel.id} onClick={() => selectChannelOrDm('channel', channel.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm transition-all ${activeChannelId === channel.id ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/5'}`}>
                    <span className="text-zinc-600 text-lg">#</span><span className="truncate">{channel.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PROFİL KÜTÜPHANESİ (SOL ALT) */}
          <div className="h-16 bg-[#0a0a0c] px-3 flex items-center justify-between border-t border-white/5 relative z-50 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="relative cursor-pointer transition-transform hover:scale-105 shrink-0" onClick={() => setStatusMenuOpen(!statusMenuOpen)}>
                <img src={currentUserProfile.avatar} className="w-9 h-9 rounded-full bg-zinc-800 object-cover" />
                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0a0a0c] ${currentUserProfile.status === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : currentUserProfile.status === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'}`} />
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <div className="text-sm font-bold truncate text-zinc-200">
                  {currentUserProfile.displayName}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">@{currentUserProfile.username}</div>
              </div>
            </div>
            
            <button onClick={() => setShowProfileModal(true)} className="p-2 text-zinc-400 hover:text-white transition-colors shrink-0" title="Ayarlar ve Hesaplar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>

            {statusMenuOpen && (
              <div className="absolute bottom-16 left-2 w-48 bg-[#18181b] border border-white/10 rounded-2xl p-2 shadow-2xl z-[100]">
                <button onClick={() => handleStatusChange('online')} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />Çevrimiçi</button>
                <button onClick={() => handleStatusChange('idle')} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Boşta</button>
                <button onClick={() => handleStatusChange('offline')} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-zinc-500" />Görünmez</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- ANA İÇERİK ALANI (MESAJLAŞMA & PANELLER) --- */}
      <div className="flex-1 flex flex-col bg-[#161619] relative min-w-0 h-full overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none"></div>

        {/* ÜST HEADER */}
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 shadow-sm shrink-0 bg-[#161619]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3 overflow-hidden">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 text-zinc-300 hover:text-white rounded-lg shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            {activeTab === 'home' ? (
              activeDmRecipient ? (
                <div className="flex items-center gap-2 font-bold text-base md:text-lg min-w-0">
                  <img src={activeDmRecipient.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  <span className="text-white truncate">{activeDmRecipient.displayName}</span>
                </div>
              ) : (
                <span className="text-zinc-300 font-bold text-base md:text-lg tracking-wide truncate">
                  {homeSubTab === 'friends' && 'Bağlantılarım'}
                  {homeSubTab === 'add-friend' && 'Yeni Kişiler'}
                  {homeSubTab === 'requests' && 'Bekleyen İstekler'}
                  {homeSubTab === 'admin' && <span className="text-rose-400">Yönetici Paneli</span>}
                </span>
              )
            ) : (
              <div className="flex items-center gap-2 font-bold text-base md:text-lg min-w-0">
                <span className="text-indigo-500 text-xl font-light shrink-0">#</span>
                <span className="text-white truncate">{activeServer?.channels.find(c => c.id === activeChannelId)?.name || 'genel'}</span>
                
                {activeServer?.inviteCode && (
                  <button onClick={() => { navigator.clipboard.writeText(activeServer.inviteCode); showNotification("Davet kodu kopyalandı", "success"); }} className="ml-3 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    Kod: {activeServer.inviteCode}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* SAĞ ÜST İKONLAR (Üyeler Paneli Togglesi) */}
          <div className="flex items-center gap-2 shrink-0">
            {activeTab.startsWith('server-') && (
              <button onClick={() => setShowMembersList(!showMembersList)} className={`p-2 rounded-lg transition-all ${showMembersList ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`} title="Üye Listesi">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex z-10 relative">
          
          {/* ORTA BÖLÜM (MESAJLAR VEYA LİSTELER) */}
          <div className="flex-1 flex flex-col min-w-0">
            {activeTab === 'home' && !activeDmRecipient ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-8">
                
                {homeSubTab === 'admin' && isAdmin && (
                  <div className="max-w-4xl mx-auto space-y-4">
                    <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-2xl mb-6">
                      <h2 className="text-xl font-black text-rose-400 tracking-widest mb-2">GİZLİ YÖNETİM MERKEZİ</h2>
                      <p className="text-sm text-zinc-400">Tüm kullanıcıları yönetin. İsim rengi beyaz kalır, mesaj ve rozet rengi değişir.</p>
                    </div>
                    <div className="space-y-3">
                      {allUsers.map(u => (
                        <div key={u.uid} className={`bg-[#1c1c21] p-4 rounded-xl border flex flex-col md:flex-row gap-4 items-center justify-between transition-all ${u.banned ? 'border-rose-500/50 opacity-80' : 'border-white/5'}`}>
                          <div className="flex items-center gap-3 w-full md:w-auto">
                            <img src={u.avatar} className="w-12 h-12 rounded-full object-cover shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-bold text-base text-white">
                                {u.displayName}
                                {u.rankName && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: u.rankColor, color: u.rankColor }}>{u.rankName}</span>}
                                {u.banned && <span className="ml-2 text-xs text-rose-500 font-black">(YASAKLI)</span>}
                              </span>
                              <span className="text-xs text-zinc-500">@{u.username}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                            <input type="text" placeholder="Örn: Kurucu" id={`rankName-${u.uid}`} defaultValue={u.rankName || ''} className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm w-32 text-white outline-none" />
                            <input type="color" id={`rankColor-${u.uid}`} defaultValue={u.rankColor || '#ffffff'} className="w-9 h-9 rounded bg-transparent cursor-pointer border border-white/10" />
                            <button onClick={() => handleSetRank(u.uid)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold shadow-md transition-all">Uygula</button>
                            {u.banned ? (
                              <button onClick={() => handleUnbanUser(u.uid)} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-bold border border-emerald-500/30">Ban Kaldır</button>
                            ) : (
                              <button onClick={() => handleBanUser(u.uid)} disabled={u.username === '1yigitt1_'} className="px-4 py-2 bg-rose-500/20 text-rose-400 rounded-lg text-sm font-bold border border-rose-500/30 disabled:opacity-50">Banla</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {homeSubTab === 'friends' && (
                  <div className="max-w-4xl mx-auto space-y-3">
                    {myFriendsList.length === 0 ? <p className="text-center text-zinc-500 mt-10">Listeniz boş.</p> : myFriendsList.map(friend => (
                      <div key={friend.uid} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1c1c21] rounded-2xl border border-white/5 gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="relative shrink-0">
                            <img src={friend.avatar} className="w-12 h-12 rounded-full object-cover bg-zinc-800" />
                            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#1c1c21] ${friend.status === 'online' ? 'bg-emerald-400' : friend.status === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'}`} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-base font-bold text-white truncate">
                              {friend.displayName}
                              {friend.rankName && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: friend.rankColor, color: friend.rankColor }}>{friend.rankName}</span>}
                            </span>
                            <span className="text-xs text-zinc-400 truncate">@{friend.username}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button onClick={() => selectChannelOrDm('dm', friend)} className="flex-1 sm:flex-none px-5 py-2.5 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white rounded-xl text-sm font-bold transition-all text-center">Sohbet</button>
                          <button onClick={() => handleBlockUser(friend.uid)} className="px-3 py-2.5 bg-zinc-800 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-400 rounded-xl text-sm transition-all" title="Kişiyi Engelle">Engel</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {homeSubTab === 'add-friend' && (
                  <div className="max-w-2xl mx-auto space-y-6">
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Kullanıcı Adı veya İsim" className="w-full bg-[#1c1c21] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white outline-none focus:border-indigo-500/50" />
                    <div className="space-y-3">
                      {searchQuery && filteredSearchUsers.map(target => (
                        <div key={target.uid} className="flex items-center justify-between p-4 bg-[#1c1c21] rounded-2xl border border-white/5">
                          <div className="flex items-center gap-3">
                            <img src={target.avatar} className="w-10 h-10 rounded-full object-cover shrink-0" />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-white">
                                {target.displayName}
                                {target.rankName && <span className="ml-2 text-[10px] px-1 py-0.5 rounded border" style={{ borderColor: target.rankColor, color: target.rankColor }}>{target.rankName}</span>}
                              </span>
                              <span className="text-xs text-zinc-400">@{target.username}</span>
                            </div>
                          </div>
                          <button onClick={() => sendFriendRequest(target)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold">İstek At</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {homeSubTab === 'requests' && (
                  <div className="max-w-2xl mx-auto space-y-6">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Gelen İstekler</h3>
                      <div className="space-y-2">
                        {friendRequests.received.map(req => (
                          <div key={req.id} className="flex flex-col sm:flex-row justify-between p-4 bg-[#1c1c21] rounded-2xl border border-indigo-500/30 gap-3">
                            <div className="flex flex-col">
                              <span className="text-base font-bold text-white">{req.fromDisplayName}</span>
                              <span className="text-xs text-zinc-400">@{req.fromUsername}</span>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                              <button onClick={() => acceptFriendRequest(req)} className="flex-1 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold">Kabul Et</button>
                              <button onClick={() => declineFriendRequest(req)} className="flex-1 px-4 py-2 bg-rose-500/10 text-rose-400 rounded-xl text-xs font-bold">Reddet</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
                  
                  {activeChatMessages.map(msg => {
                    const senderUser = allUsers.find(u => u.uid === msg.senderId);
                    
                    // Sunucu içi özel rol önceliği, yoksa Global Rütbe
                    const serverRole = activeServer?.memberRoles?.[msg.senderId];
                    const rName = serverRole?.name || senderUser?.rankName;
                    const rColor = serverRole?.color || senderUser?.rankColor || '';

                    return (
                      <div key={msg.id} className="flex items-start gap-3 md:gap-4 group relative">
                        <img src={msg.senderAvatar} className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-zinc-800 mt-1 object-cover flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          
                          <div className="flex items-baseline gap-2 flex-wrap mb-1">
                            {/* İsim HER ZAMAN beyaz/gri */}
                            <span className={`text-[13px] md:text-sm font-bold ${msg.senderId === currentUserProfile?.uid ? 'text-indigo-400' : 'text-zinc-100'}`}>
                              {msg.senderDisplayName}
                            </span>
                            
                            {/* ROZET rengi ve mesaj rengi değişir */}
                            {rName && (
                              <span className="text-[9px] font-extrabold px-1.5 py-[1px] rounded border" style={{ borderColor: rColor, color: rColor }}>
                                {rName}
                              </span>
                            )}

                            <span className="text-[10px] text-zinc-500">@{msg.senderUsername} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            {msg.isEdited && <span className="text-[9px] text-zinc-500 italic">(düzenlendi)</span>}
                          </div>
                          
                          {editingMessageId === msg.id ? (
                            <form onSubmit={handleEditMessage} className="mt-2 flex items-center gap-2">
                              <input autoFocus type="text" value={editMessageText} onChange={e => setEditMessageText(e.target.value)} className="w-full bg-[#1c1c21] border border-indigo-500/50 rounded-lg px-3 py-2 focus:outline-none text-sm text-white transition-all" />
                              <button type="submit" className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition-all">Kaydet</button>
                              <button type="button" onClick={() => setEditingMessageId(null)} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg transition-all">İptal</button>
                            </form>
                          ) : (
                            <p className="text-sm break-words leading-relaxed mt-0.5" style={{ color: rName ? rColor : '#d4d4d8' }}>
                              {msg.text}
                            </p>
                          )}
                        </div>

                        {!editingMessageId && (
                          <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-[#161619]/90 backdrop-blur-sm p-1 rounded-lg border border-white/5 transition-opacity duration-200">
                            {msg.senderId === currentUserProfile?.uid && (
                              <>
                                <button onClick={() => { setEditingMessageId(msg.id); setEditMessageText(msg.text); }} className="p-1.5 text-zinc-400 hover:text-indigo-400 rounded-md" title="Düzenle"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                <button onClick={() => handleDeleteForAll(msg.id)} className="p-1.5 text-zinc-400 hover:text-rose-400 rounded-md" title="Herkesten Sil"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                              </>
                            )}
                            <button onClick={() => handleDeleteForMe(msg.id)} className="p-1.5 text-zinc-400 hover:text-amber-400 rounded-md" title="Sadece Benden Sil"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                
                <div className="p-3 md:p-4 bg-[#161619] relative z-20 shrink-0 border-t border-white/5">
                  <form onSubmit={handleSendMessage} className="relative flex items-center">
                    <input type="text" value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="Mesajınızı yazınız..." className="w-full bg-[#1c1c21] border border-white/10 rounded-2xl pl-4 pr-14 py-3 md:py-4 focus:outline-none text-sm text-white placeholder-zinc-500 transition-all focus:border-indigo-500/50" />
                    <button type="submit" disabled={!messageText.trim()} className="absolute right-2 p-2 bg-indigo-600 rounded-xl text-white disabled:opacity-0 shadow-lg">
                      <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* SAĞ PANEL: SUNUCU ÜYELERİ (Sadece Sunuculardayken açılır) */}
          {activeTab.startsWith('server-') && showMembersList && (
            <div className="w-[240px] bg-[#121214] border-l border-white/5 flex flex-col h-full shrink-0 z-20 absolute right-0 md:relative">
              <div className="h-14 border-b border-white/5 flex items-center px-4 font-bold text-sm text-zinc-300 shrink-0">
                Sunucu Üyeleri ({activeServer?.members?.length || 0})
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                
                {/* Yöneticiler (Sunucu Sahibi) */}
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">Kurucu</div>
                  {allUsers.filter(u => u.uid === activeServer?.ownerId).map(u => (
                    <div key={u.uid} className="flex items-center gap-3 px-2 py-1.5">
                      <div className="relative">
                        <img src={u.avatar} className="w-8 h-8 rounded-full object-cover" />
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#121214] ${u.status === 'online' ? 'bg-emerald-400' : u.status === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'}`} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-bold text-white truncate">{u.displayName} <span className="text-amber-400">👑</span></span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Diğer Üyeler */}
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1 mt-2">Üyeler</div>
                  {allUsers.filter(u => activeServer?.members?.includes(u.uid) && u.uid !== activeServer?.ownerId).map(u => {
                    const sRole = activeServer?.memberRoles?.[u.uid];
                    return (
                      <div key={u.uid} className="flex flex-col gap-1 mb-2">
                        <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                          <div className="relative shrink-0">
                            <img src={u.avatar} className="w-8 h-8 rounded-full object-cover" />
                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#121214] ${u.status === 'online' ? 'bg-emerald-400' : u.status === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'}`} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-bold text-white truncate">
                              {u.displayName}
                            </span>
                            {sRole && <span className="text-[9px] font-bold truncate mt-0.5" style={{ color: sRole.color }}>{sRole.name}</span>}
                          </div>
                        </div>

                        {/* ROL VERME ALANI (SADECE KURUCU GÖRÜR) */}
                        {activeServer?.ownerId === currentUserProfile?.uid && (
                          <div className="flex items-center gap-1 px-2 mb-2 opacity-50 hover:opacity-100 transition-opacity">
                            <input type="text" id={`serverRankName-${u.uid}`} defaultValue={sRole?.name || ''} placeholder="Rol Adı" className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-white w-full outline-none" />
                            <input type="color" id={`serverRankColor-${u.uid}`} defaultValue={sRole?.color || '#ffffff'} className="w-6 h-6 rounded bg-transparent cursor-pointer border border-white/10 shrink-0" />
                            <button onClick={() => handleSetServerRole(u.uid)} className="bg-indigo-600 text-white text-[9px] font-bold px-2 py-1 rounded shrink-0">Ver</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* --- MODALLAR --- */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121214] border border-white/10 rounded-3xl p-6 relative max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Hesap Ayarları</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-zinc-500 hover:text-white text-2xl">&times;</button>
            </div>
            
            <form onSubmit={handleUpdateProfile} className="space-y-4 mb-6">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">Görünür İsim</label>
                <input type="text" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mt-1 focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">Profil Resmi (Dosya Seç)</label>
                <div className="flex items-center gap-4 mt-2 bg-[#18181b] border border-white/10 rounded-xl p-3">
                  <img src={editAvatarUrl || currentUserProfile?.avatar} className="w-14 h-14 rounded-full object-cover border border-white/5 bg-zinc-800" />
                  <label className="px-4 py-2 bg-indigo-500/20 text-indigo-300 rounded-lg text-sm font-bold cursor-pointer text-center flex-1">
                    Değiştir <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold">Görünümü Kaydet</button>
            </form>
            
            <div className="pt-4 border-t border-white/10">
              <p className="text-[10px] font-bold text-zinc-500 uppercase mb-3 ml-1 tracking-widest">Kayıtlı Hesaplar</p>
              <div className="space-y-2 mb-4">
                {savedAccounts.map(acc => (
                  <div key={acc.uid} className={`flex items-center justify-between p-2.5 rounded-xl border ${acc.uid === currentUserProfile.uid ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-[#18181b] border-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <img src={acc.avatar} className="w-8 h-8 rounded-full object-cover" />
                      <div className="flex flex-col min-w-0"><span className="text-sm font-bold text-white truncate max-w-[120px]">{acc.displayName}</span></div>
                    </div>
                    {acc.uid !== currentUserProfile.uid ? (
                      <button onClick={() => handleQuickLogin(acc.uid)} className="px-3 py-1.5 bg-zinc-800 rounded-lg text-xs font-bold text-white">Geçiş</button>
                    ) : (<span className="px-2 py-1 text-[10px] font-bold text-indigo-400 bg-indigo-500/20 rounded-md">Aktif</span>)}
                  </div>
                ))}
              </div>
              <button onClick={handleLogout} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-bold mt-2">Çıkış Yap</button>
              
              {/* KALICI HESAP SİLME BUTONU */}
              <button onClick={handleDeleteAccount} className="w-full py-3 mt-4 bg-transparent border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 rounded-xl text-sm font-bold transition-all">
                Hesabımı Kalıcı Olarak Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewServerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121214] border border-white/10 rounded-3xl p-6 relative">
            <h3 className="text-xl font-bold mb-4 text-white">Ağ Oluştur</h3>
            <form onSubmit={handleCreateServer}>
              <input type="text" value={newServerName} onChange={e => setNewServerName(e.target.value)} placeholder="Sunucu Adı" className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 mb-4 text-white text-sm outline-none" required />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowNewServerModal(false)} className="flex-1 py-3 bg-zinc-800 rounded-xl text-sm font-bold">İptal</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">Oluştur</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showJoinServerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121214] border border-white/10 rounded-3xl p-6 relative">
            <h3 className="text-xl font-bold mb-4 text-white">Ağa Katıl</h3>
            <form onSubmit={handleJoinServer}>
              <input type="text" value={joinInviteCode} onChange={e => setJoinInviteCode(e.target.value)} placeholder="Davet Kodu" className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 mb-4 text-white text-sm outline-none uppercase" required />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowJoinServerModal(false)} className="flex-1 py-3 bg-zinc-800 rounded-xl text-sm font-bold">İptal</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">Katıl</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {showNewChannelModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121214] border border-white/10 rounded-3xl p-6 relative">
            <h3 className="text-xl font-bold mb-4 text-white">Kanal Aç</h3>
            <form onSubmit={handleCreateChannel}>
              <input type="text" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="Kanal Adı" className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 mb-4 text-white text-sm outline-none" required />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowNewChannelModal(false)} className="flex-1 py-3 bg-zinc-800 rounded-xl text-sm font-bold">İptal</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">Oluştur</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}