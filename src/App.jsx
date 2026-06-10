import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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

// Firebase Başlatma İşlemleri
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export default function App() {
  // --- KULLANICI VE AUTHENTICATION STATE'LERİ ---
  const [user, setUser] = useState(null); 
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState(null); 
  const [savedAccounts, setSavedAccounts] = useState([]); 
  
  // Giriş ve Kayıt Ekranı Form State'leri
  const [authMode, setAuthMode] = useState('saved'); 
  const [usernameInput, setUsernameInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  
  // Veritabanından Anlık Gelecek Tüm Listeler
  const [allUsers, setAllUsers] = useState([]);
  const [allServers, setAllServers] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [allFriendRequests, setAllFriendRequests] = useState([]);

  // Navigasyon ve Sayfa Kontrol State'leri
  const [activeTab, setActiveTab] = useState('home');
  const [homeSubTab, setHomeSubTab] = useState('friends');
  const [activeChannelId, setActiveChannelId] = useState('genel');
  const [activeDmRecipient, setActiveDmRecipient] = useState(null);
  
  // Mobil Tasarım ve Sağ Panel State'leri
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false); 
  
  // Dinamik Form Girdileri
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newServerName, setNewServerName] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');
  
  // Profil Güncelleme ve Düzenleme Modalı State'leri
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  
  // Genel Arayüz Kontrol Modalları
  const [showNewServerModal, setShowNewServerModal] = useState(false);
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Mesaj Düzenleme State'leri
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');

  // YENİ EKLEMELER: SESLİ ARAMA VE DOSYA YÜKLEME STATE'LERİ
  const [activeCallRoom, setActiveCallRoom] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const messagesEndRef = useRef(null);

  // Dinamik Bildirim Gösterme Fonksiyonu
  const showNotification = (message, type = 'info') => {
    const id = crypto.randomUUID();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };

  // Admin Kontrolü
  const isAdmin = currentUserProfile?.username === '1yigitt1_';

  // 1. FIREBASE AUTHENTICATION BAŞLATICI
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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => { unsubscribe(); };
  }, []);

  // 2. VERİTABANI ANLIK DİNLEYİCİLERİ (REALTIME SNAPSHOTS)
  useEffect(() => {
    if (!user) { return; }

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
        if (!targetProfileUid) { return; }

        if (unProfile) { unProfile(); } 
        
        unProfile = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetProfileUid), (pSnap) => {
          if (pSnap.exists()) {
            setCurrentUserProfile(pSnap.data());
            setEditDisplayName(pSnap.data().displayName);
            setEditAvatarUrl(pSnap.data().avatar);
          } else {
            setCurrentUserProfile(null);
          }
        });
      } else {
        setCurrentUserProfile(null);
        setSavedAccounts([]);
        setAuthMode('register');
      }
    });

    const unUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snap) => {
      const list = [];
      snap.forEach((d) => { list.push(d.data()); });
      setAllUsers(list);
    });

    const unServers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'servers'), (snap) => {
      const list = [];
      snap.forEach((d) => { list.push({ id: d.id, ...d.data() }); });
      setAllServers(list);
    });

    const unReqs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'friend_requests'), (snap) => {
      const list = [];
      snap.forEach((d) => { list.push({ id: d.id, ...d.data() }); });
      setAllFriendRequests(list);
    });

    const unMsgs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), (snap) => {
      const list = [];
      snap.forEach((d) => { list.push({ id: d.id, ...d.data() }); });
      list.sort((a, b) => { return a.timestamp - b.timestamp; });
      setAllMessages(list);
    });

    return () => { 
      unSession(); 
      if (unProfile) { unProfile(); } 
      unUsers(); 
      unServers(); 
      unReqs(); 
      unMsgs(); 
    };
  }, [user]);

  // 3. SEKMEYİ VEYA TARAYICIYI KAPATINCA ANINDA OFFLINE YAPMA DINLEYICISI
  useEffect(() => {
    const handleWindowClose = () => {
      if (currentUserProfile?.uid) {
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { 
          status: 'offline' 
        }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleWindowClose);
    return () => { window.removeEventListener('beforeunload', handleWindowClose); };
  }, [currentUserProfile]);

  // 4. ANLIK OKUNMUŞ MESAJ / SON GÖRÜLME TAKİBİ
  useEffect(() => {
    if (!currentUserProfile || !user) { return; }
    const currentContext = activeTab === 'home' && activeDmRecipient ? activeDmRecipient.uid : activeTab.replace('server-', '');
    
    if (currentContext && currentContext !== 'home') {
      const lastReadTime = currentUserProfile.lastRead?.[currentContext] || 0;
      const contextMsgs = allMessages.filter((m) => {
        return m.serverId === currentContext || (m.serverId === 'dm' && (m.senderId === currentContext || m.channelId === currentContext));
      });
      
      if (contextMsgs.length > 0) {
        const latestMsgTime = contextMsgs[contextMsgs.length - 1].timestamp;
        if (latestMsgTime > lastReadTime) {
          updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), {
            [`lastRead.${currentContext}`]: Date.now()
          }).catch(() => {});
        }
      }
    }
  }, [activeTab, activeDmRecipient, allMessages, currentUserProfile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, activeTab, activeChannelId, activeDmRecipient]);

  // --- ARKA PLAN DOSYA YÜKLEME SİSTEMİ (YENİ) ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUserProfile) return;

    if (file.size > 50 * 1024 * 1024) { 
      return showNotification("Dosya boyutu maksimum 50MB olabilir.", "error");
    }

    const fileRef = ref(storage, `nexus_files/${Date.now()}_${file.name}`);
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
        showNotification("Dosya yüklenirken hata oluştu.", "error");
      }, 
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setIsUploading(false);
        setUploadProgress(0);
        
        const isServer = activeTab.startsWith('server-');
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
          serverId: isServer ? activeTab.replace('server-', '') : 'dm',
          channelId: isServer ? activeChannelId : activeDmRecipient.uid,
          senderId: currentUserProfile.uid,
          senderUsername: currentUserProfile.username, 
          senderDisplayName: currentUserProfile.displayName,
          senderAvatar: currentUserProfile.avatar,
          text: "", 
          fileUrl: downloadURL,
          fileName: file.name,
          fileType: file.type,
          timestamp: Date.now(), 
          deletedFor: [] 
        });
      }
    );
    e.target.value = null; 
  };

  // --- SESLİ / GÖRÜNTÜLÜ ARAMA ODASI BAŞLATICI (YENİ) ---
  const startVoiceCall = () => {
    let roomId = "";
    if (activeTab === 'home' && activeDmRecipient) {
      const uids = [currentUserProfile.uid, activeDmRecipient.uid].sort();
      roomId = `nexus-call-dm-${uids[0]}-${uids[1]}`;
    } else if (activeTab.startsWith('server-')) {
      roomId = `nexus-call-server-${activeTab.replace('server-', '')}-${activeChannelId}`;
    }
    setActiveCallRoom(roomId);
  };

  // --- HESAP YÖNETİM FONKSİYONLARI ---
  const saveAccountToDevice = async (profile) => {
    if (!user) { return; }
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid);
    const snap = await getDoc(sessionRef);
    let newSaved = snap.exists() && snap.data().savedAccounts ? snap.data().savedAccounts : [];
    
    newSaved = newSaved.filter((a) => { return a.uid !== profile.uid; });
    newSaved.push({
      uid: profile.uid,
      username: profile.username,
      displayName: profile.displayName,
      avatar: profile.avatar
    });
    
    await setDoc(sessionRef, {
      profileUid: profile.uid,
      status: 'active',
      savedAccounts: newSaved
    }, { merge: true });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim().toLowerCase().replace(/\s+/g, '');
    const cleanDisplay = displayNameInput.trim();
    
    if (!cleanUser || !cleanDisplay || !passwordInput) {
      return showNotification("Lütfen tüm alanları doldurun.", "warning");
    }
    if (allUsers.some((u) => { return u.username === cleanUser; })) {
      return showNotification(`@${cleanUser} kullanıcı adı zaten alınmış!`, "error");
    }

    try {
      const newProfileId = crypto.randomUUID(); 
      const newProfile = {
        uid: newProfileId,
        username: cleanUser,
        displayName: cleanDisplay,
        password: passwordInput,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUser)}`,
        status: 'online',
        friends: [],
        banned: false,
        hiddenDMs: [],
        blockedUsers: [],
        lastRead: {}
      };
      
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', newProfileId), newProfile);
      await saveAccountToDevice(newProfile);
      
      setUsernameInput('');
      setPasswordInput('');
      setDisplayNameInput('');
      showNotification(`Hesabınız başarıyla oluşturuldu.`, "success");
    } catch (error) {
      showNotification("Kayıt hatası.", "error");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim().toLowerCase().replace(/\s+/g, '');
    
    if (!cleanUser || !passwordInput) {
      return showNotification("Kullanıcı adı ve şifre gereklidir.", "warning");
    }

    const foundUser = allUsers.find((u) => { return u.username === cleanUser && u.password === passwordInput; });
    
    if (foundUser) {
      if (foundUser.banned) {
        return showNotification("Bu hesap sistemden yasaklanmıştır!", "error");
      }
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.uid), { status: 'online' });
        await saveAccountToDevice(foundUser);
        setUsernameInput('');
        setPasswordInput('');
        showNotification(`Tekrar hoş geldin, ${foundUser.displayName}!`, "success");
      } catch (err) {
        showNotification("Giriş hatası.", "error");
      }
    } else {
      showNotification("Kullanıcı adı veya şifre hatalı!", "error");
    }
  };

  const handleQuickLogin = async (accountUid) => {
    if (!user) { return; }
    const targetUser = allUsers.find((u) => { return u.uid === accountUid; });
    if (targetUser?.banned) {
      return showNotification("Bu hesap yasaklanmıştır!", "error");
    }
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', accountUid), { status: 'online' });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid), {
        profileUid: accountUid,
        status: 'active'
      });
      setShowProfileModal(false);
      showNotification("Hesap geçişi başarılı.", "success");
    } catch (err) {
      showNotification("Geçiş yapılamadı.", "error");
    }
  };

  const handleLogout = async () => {
    if (!user) { return; }
    try {
      if (currentUserProfile) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { status: 'offline' });
      }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'device_sessions', user.uid), { status: 'logged_out' });
      setShowProfileModal(false);
      setStatusMenuOpen(false);
      setUsernameInput('');
      setPasswordInput('');
      setDisplayNameInput('');
      showNotification("Çıkış yapıldı.", "info");
    } catch (err) {}
  };

  const handleDeleteAccount = async () => {
    if (!currentUserProfile) { return; }
    if (!window.confirm("Hesabınızı silmek istediğinize emin misiniz?")) { return; }
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid));
      await handleLogout();
      showNotification("Hesabınız silindi.", "success");
    } catch (err) {
      showNotification("Başarısız.", "error");
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!currentUserProfile || !user) { return; }
    try {
      let finalAvatar = editAvatarUrl.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUserProfile.username)}`;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), {
        displayName: editDisplayName.trim() || currentUserProfile.displayName,
        avatar: finalAvatar
      });
      setShowProfileModal(false);
      showNotification("Profil güncellendi!", "success");
    } catch (err) {}
  };

  const handleStatusChange = async (newStatus) => {
    if (!currentUserProfile) { return; }
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), { status: newStatus });
    setStatusMenuOpen(false);
  };

  const toggleHideDM = async (e, friendUid, isHiding) => {
    e.stopPropagation(); 
    if (!currentUserProfile) { return; }
    try {
      if (isHiding) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), {
          hiddenDMs: arrayUnion(friendUid)
        });
        showNotification("Sohbet listeden gizlendi.", "info");
        if (activeDmRecipient?.uid === friendUid) {
          setActiveDmRecipient(null);
        }
      }
    } catch (err) {}
  };

  const handleBlockUser = async (targetUid) => {
    if (!currentUserProfile) { return; }
    if (!window.confirm("Bu kişiyi engellemek istiyor musunuz?")) { return; }
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), {
        blockedUsers: arrayUnion(targetUid)
      });
      showNotification("Kullanıcı engellendi.", "success");
      if (activeDmRecipient?.uid === targetUid) {
        setActiveDmRecipient(null);
      }
    } catch (err) {}
  };

  const selectChannelOrDm = async (type, data) => {
    if (type === 'dm') {
      setActiveDmRecipient(data);
      setActiveTab('home');
      setShowMembersList(false);
      if (currentUserProfile?.hiddenDMs?.includes(data.uid)) {
        try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserProfile.uid), {
            hiddenDMs: arrayRemove(data.uid)
          });
        } catch (error) {}
      }
    } else if (type === 'channel') {
      setActiveChannelId(data);
    }
    setIsMobileMenuOpen(false);
  };

  // --- ADMİN PANELİ YÖNETİMİ ---
  const handleSetRank = async (targetUid) => {
    const rName = document.getElementById(`rankName-${targetUid}`).value.trim();
    const rColor = document.getElementById(`rankColor-${targetUid}`).value;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid), { 
        rankName: rName, 
        rankColor: rName ? rColor : null 
      });
      showNotification("Rütbe güncellendi", "success");
    } catch(err) {}
  };

  const handleAdminDeleteUser = async (targetUid) => {
    if (!window.confirm("Bu hesabı veritabanından KALICI olarak silmek istiyor musunuz?")) { return; }
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid));
      showNotification("Hesap kalıcı olarak silindi.", "success");
    } catch (err) {
      showNotification("Silme başarısız.", "error");
    }
  };

  // --- SUNUCU İŞLEMLERİ ---
  const handleCreateServer = async (e) => {
    e.preventDefault();
    if (!newServerName.trim() || !currentUserProfile) { return; }
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'servers'), {
        name: newServerName.trim(), 
        icon: newServerName.trim().substring(0, 2).toUpperCase(),
        ownerId: currentUserProfile.uid, 
        channels: [{ id: 'genel', name: 'genel' }],
        inviteCode: inviteCode, 
        members: [currentUserProfile.uid], 
        memberRoles: {}
      });
      setNewServerName(''); 
      setShowNewServerModal(false);
      setActiveTab(`server-${docRef.id}`); 
      setActiveChannelId('genel');
      showNotification("Sunucu kuruldu!", "success");
    } catch (err) {}
  };

  const handleJoinServer = async (e) => {
    e.preventDefault();
    const code = joinInviteCode.trim().toUpperCase();
    if (!code || !currentUserProfile) { return; }
    const serverToJoin = allServers.find((s) => { return s.inviteCode === code; });
    
    if (!serverToJoin) { return showNotification("Davet kodu bulunamadı!", "error"); }
    
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'servers', serverToJoin.id), { 
        members: [...(serverToJoin.members || []), currentUserProfile.uid] 
      });
      setShowJoinServerModal(false); 
      setJoinInviteCode('');
      setActiveTab(`server-${serverToJoin.id}`); 
      setActiveChannelId(serverToJoin.channels[0]?.id || 'genel');
    } catch(err) {}
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentUserProfile) { return; }
    try {
      const isServer = activeTab.startsWith('server-');
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        serverId: isServer ? activeTab.replace('server-', '') : 'dm',
        channelId: isServer ? activeChannelId : activeDmRecipient.uid,
        senderId: currentUserProfile.uid,
        senderUsername: currentUserProfile.username, 
        senderDisplayName: currentUserProfile.displayName,
        senderAvatar: currentUserProfile.avatar,
        text: messageText.trim(), 
        timestamp: Date.now(), 
        deletedFor: [] 
      });
      setMessageText('');
    } catch (err) {}
  };

  const getUnreadCount = (contextId) => {
    if (!currentUserProfile) { return 0; }
    const lastReadTime = currentUserProfile.lastRead?.[contextId] || 0;
    return allMessages.filter((m) => {
      return (m.serverId === contextId || (m.serverId === 'dm' && m.senderId === contextId)) && m.timestamp > lastReadTime && m.senderId !== currentUserProfile.uid;
    }).length;
  };

  // --- HAFIZA VE GELİŞMİŞ AKILLI SIRALAMALAR ---
  const myFriendsList = useMemo(() => {
    if (!currentUserProfile) { return []; }
    return allUsers.filter((u) => {
      return currentUserProfile.friends && currentUserProfile.friends.includes(u.uid) && !currentUserProfile.blockedUsers?.includes(u.uid);
    });
  }, [allUsers, currentUserProfile]);

  const sidebarDmList = useMemo(() => {
    if (!currentUserProfile) { return []; }
    let friends = allUsers.filter((u) => {
      return currentUserProfile.friends && currentUserProfile.friends.includes(u.uid) && !currentUserProfile.blockedUsers?.includes(u.uid);
    });
    
    return friends.filter((f) => {
      const isHidden = currentUserProfile.hiddenDMs && currentUserProfile.hiddenDMs.includes(f.uid);
      const unreadCount = getUnreadCount(f.uid);
      const isActive = activeDmRecipient?.uid === f.uid;
      return !isHidden || unreadCount > 0 || isActive;
    });
  }, [allUsers, currentUserProfile, allMessages, activeDmRecipient]);

  const sortedServersList = useMemo(() => {
    if (!currentUserProfile) { return []; }
    return allServers.filter((s) => { return !s.members || s.members.includes(currentUserProfile.uid); });
  }, [allServers, currentUserProfile]);

  const activeChatMessages = useMemo(() => {
    let msgs = [];
    if (activeTab.startsWith('server-')) {
      msgs = allMessages.filter((m) => { return m.serverId === activeTab.replace('server-', '') && m.channelId === activeChannelId; });
    }
    if (activeTab === 'home' && activeDmRecipient) {
      msgs = allMessages.filter((m) => { return m.serverId === 'dm' && ((m.senderId === currentUserProfile?.uid && m.channelId === activeDmRecipient.uid) || (m.senderId === activeDmRecipient.uid && m.channelId === currentUserProfile?.uid)); });
    }
    return msgs.filter((m) => { return !(m.deletedFor && m.deletedFor.includes(currentUserProfile?.uid)); });
  }, [allMessages, activeTab, activeChannelId, activeDmRecipient, currentUserProfile]);
  
  const activeServer = activeTab.startsWith('server-') ? allServers.find((s) => { return s.id === activeTab.replace('server-', ''); }) : null;

  if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-[#09090b]"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;

  if (!currentUserProfile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#09090b] text-zinc-100">
        <div className="w-full max-w-md bg-[#121214] p-8 rounded-[2rem] shadow-2xl border border-white/5">
          <h2 className="text-3xl font-black text-center mb-6 tracking-wider">NEXUS</h2>
          <div className="flex bg-[#18181b] rounded-xl p-1 mb-6">
            <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${authMode === 'login' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Giriş Yap</button>
            <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${authMode === 'register' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Kayıt Ol</button>
          </div>
          <form onSubmit={authMode === 'register' ? handleRegister : handleLogin} className="space-y-4">
            {authMode === 'register' && <input type="text" value={displayNameInput} onChange={e => setDisplayNameInput(e.target.value)} placeholder="Görünür İsim" className="w-full bg-[#18181b] border border-white/10 p-3.5 rounded-xl text-white text-sm outline-none" required />}
            <input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Kullanıcı Adı" className="w-full bg-[#18181b] border border-white/10 p-3.5 rounded-xl text-white text-sm outline-none lowercase" required />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Şifre" className="w-full bg-[#18181b] border border-white/10 p-3.5 rounded-xl text-white text-sm outline-none" required />
            <button type="submit" className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-indigo-500 transition-all">{authMode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col md:flex-row overflow-hidden bg-[#09090b] text-zinc-100 font-sans relative">
      <div className="absolute top-4 right-4 z-[100] flex flex-col gap-2">{notifications.map(n => <div key={n.id} className="px-4 py-3 rounded-xl shadow-xl border border-white/10 bg-[#18181b]/95 text-xs text-indigo-400 font-bold">{n.message}</div>)}</div>
      
      {/* SOL SUNUCU BAR BAR */}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 flex h-full transition-transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="w-[80px] bg-[#0f0f13] flex flex-col items-center py-4 gap-3 border-r border-white/5 shrink-0">
          <button onClick={() => { setActiveTab('home'); setActiveDmRecipient(null); }} className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${activeTab === 'home' ? 'bg-indigo-600 text-white' : 'bg-[#18181b] text-zinc-400'}`}>Merkez</button>
          <div className="w-8 h-[2px] bg-white/5 rounded-full" />
          {sortedServersList.map(server => (
            <button key={server.id} onClick={() => { setActiveTab(`server-${server.id}`); setActiveChannelId(server.channels[0]?.id || 'genel'); }} className={`w-12 h-12 rounded-2xl font-black text-sm ${activeTab === `server-${server.id}` ? 'bg-indigo-600 text-white' : 'bg-[#18181b]'}`}>{server.icon}</button>
          ))}
          <button onClick={() => setShowNewServerModal(true)} className="w-12 h-12 rounded-2xl bg-[#18181b] text-emerald-400 font-bold">+</button>
        </div>

        {/* ALT KANALLAR VE DM KUTUSU */}
        <div className="w-[240px] bg-[#121214] flex flex-col h-full border-r border-white/5">
          <div className="h-14 border-b border-white/5 flex items-center px-4 font-black text-white">{activeTab === 'home' ? 'NEXUS Merkez' : activeServer?.name}</div>
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {activeTab === 'home' ? (
              <>
                <button onClick={() => setHomeSubTab('friends')} className="w-full text-left px-3 py-2.5 rounded-xl font-bold text-sm text-zinc-400 hover:bg-white/5">Bağlantılarım</button>
                {isAdmin && <button onClick={() => setHomeSubTab('admin')} className="w-full text-left px-3 py-2.5 rounded-xl font-bold text-sm text-rose-400 hover:bg-white/5 border border-rose-500/20 mt-2">👑 Yönetici Paneli</button>}
                <div className="pt-4 px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Direkt Mesajlar</div>
                {sidebarDmList.map(friend => (
                  <div key={friend.uid} className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer ${activeDmRecipient?.uid === friend.uid ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5'}`} onClick={() => { selectChannelOrDm('dm', friend); }}>
                    <div className="flex items-center gap-2">
                      <div className="relative"><img src={friend.avatar} className="w-7 h-7 rounded-full object-cover" /><span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-[#121214] ${friend.status === 'online' ? 'bg-emerald-400' : 'bg-zinc-500'}`} /></div>
                      <span className="text-[13px] font-bold truncate">{friend.displayName}</span>
                    </div>
                    <button onClick={(e) => toggleHideDM(e, friend.uid, true)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 font-bold hover:text-white">X</button>
                  </div>
                ))}
              </>
            ) : (
              activeServer?.channels.map(channel => (
                <button key={channel.id} onClick={() => selectChannelOrDm('channel', channel.id)} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold ${activeChannelId === channel.id ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/5'}`}># {channel.name}</button>
              ))
            )}
          </div>
          <div className="h-16 bg-[#0a0a0c] px-3 flex items-center justify-between border-t border-white/5">
            <div className="flex items-center gap-2"><img src={currentUserProfile.avatar} className="w-8 h-8 rounded-full object-cover" /><span className="text-sm font-bold truncate">{currentUserProfile.displayName}</span></div>
            <button onClick={() => setShowProfileModal(true)} className="p-2 text-zinc-400 hover:text-white">⚙️</button>
          </div>
        </div>
      </div>

      {/* ANA SOHBET PENCERESİ */}
      <div className="flex-1 flex flex-col bg-[#161619] relative min-w-0 h-full">
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 shrink-0 bg-[#161619]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden text-zinc-300">☰</button>
            <span className="font-bold text-base">{activeTab === 'home' && activeDmRecipient ? activeDmRecipient.displayName : activeTab === 'home' ? 'Merkez' : `# ${activeServer?.channels.find(c => c.id === activeChannelId)?.name}`}</span>
          </div>
          
          {/* SAĞ ÜST ARAMA (SESLİ KONUŞMA) İKONU */}
          <div className="flex items-center gap-2">
            {(activeTab.startsWith('server-') || activeDmRecipient) && !activeCallRoom && (
              <button onClick={startVoiceCall} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md">
                📞 Arama Başlat
              </button>
            )}
            {activeTab.startsWith('server-') && <button onClick={() => setShowMembersList(!showMembersList)} className="p-2 text-sm text-zinc-400 hover:text-white">👥 Üyeler</button>}
          </div>
        </div>

        {/* SESLİ VE GÖRÜNTÜLÜ ARAMA ODASI GÖRÜNÜMÜ */}
        {activeCallRoom ? (
          <div className="flex-1 relative flex flex-col bg-black z-50">
            <div className="absolute top-4 left-4 z-50">
              <button onClick={() => setActiveCallRoom(null)} className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-sm rounded-xl shadow-2xl">
                🔴 Aramadan Ayrıl / Kapat
              </button>
            </div>
            <iframe 
              src={`https://meet.jit.si/${activeCallRoom}#config.startWithVideo=false&interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","closedcaptions","desktop","fullscreen","fodeviceselection","hangup","profile","chat","livestreaming","etherpad","sharedvideo","settings","raisehand","videoquality","filmstrip","invite","feedback","stats","shortcuts","tileview","videobackgroundblur","download","help","mute-everyone","e2ee"]`}
              allow="camera; microphone; fullscreen; display-capture"
              className="w-full h-full border-0"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex z-10 relative">
            <div className="flex-1 flex flex-col min-w-0">
              {activeTab === 'home' && !activeDmRecipient ? (
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                  {homeSubTab === 'admin' && isAdmin && (
                    <div className="space-y-2 max-w-2xl mx-auto">
                      {allUsers.map(u => (
                        <div key={u.uid} className="bg-[#1c1c21] p-4 rounded-xl border border-white/5 flex justify-between items-center">
                          <div className="flex items-center gap-3"><img src={u.avatar} className="w-10 h-10 rounded-full object-cover" /><div><div className="font-bold">{u.displayName}</div><div className="text-xs text-amber-400">@{u.username}</div></div></div>
                          <div className="flex gap-2">
                            <button onClick={() => handleQuickLogin(u.uid)} className="px-3 py-1 bg-purple-600 rounded text-xs font-bold">Giriş</button>
                            <button onClick={() => handleAdminDeleteUser(u.uid)} className="px-3 py-1 bg-rose-600 rounded text-xs font-bold">Sil</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {homeSubTab === 'friends' && myFriendsList.map(friend => (
                    <div key={friend.uid} className="flex justify-between items-center p-4 bg-[#1c1c21] rounded-2xl mb-2 border border-white/5 max-w-2xl mx-auto">
                      <div className="flex items-center gap-3"><img src={friend.avatar} className="w-10 h-10 rounded-full object-cover" /><span className="font-bold">{friend.displayName}</span></div>
                      <button onClick={() => selectChannelOrDm('dm', friend)} className="px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold">Sohbet Aç</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {activeChatMessages.map(msg => (
                      <div key={msg.id} className="flex gap-3 items-start">
                        <img src={msg.senderAvatar} className="w-9 h-9 rounded-full object-cover shrink-0 bg-zinc-800" />
                        <div className="min-w-0 flex-1">
                          <div className="flex gap-2 items-baseline"><span className="text-[13px] font-bold text-zinc-200">{msg.senderDisplayName}</span><span className="text-[10px] text-zinc-500">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
                          {msg.text && <p className="text-sm text-zinc-300 break-words mt-0.5">{msg.text}</p>}
                          
                          {/* YENİ EKLEME: MEDYA VE DOSYA ÖNİZLEME ALANI */}
                          {msg.fileUrl && (
                            <div className="mt-2 max-w-sm md:max-w-md">
                              {msg.fileType?.startsWith('image/') ? (
                                <img src={msg.fileUrl} alt="Görsel" className="rounded-xl border border-white/10 max-h-60 object-contain bg-zinc-900" />
                              ) : msg.fileType?.startsWith('video/') ? (
                                <video src={msg.fileUrl} controls className="rounded-xl border border-white/10 max-h-60 bg-zinc-900 w-full" />
                              ) : msg.fileType?.startsWith('audio/') ? (
                                <audio src={msg.fileUrl} controls className="w-full outline-none" />
                              ) : (
                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all text-sm text-indigo-400 font-bold w-max max-w-full">
                                  <span>📄 {msg.fileName || "Belgeyi İndir"}</span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* MESAJ YAZMA VE ATAŞ DOSYA ATMA KUTUSU */}
                  <div className="p-3 bg-[#161619] border-t border-white/5 relative shrink-0">
                    {isUploading && (
                      <div className="absolute -top-8 left-0 w-full px-4 flex items-center gap-2 text-[11px] font-black text-indigo-400 bg-[#161619]/90 py-1 border-t border-white/5">
                        <span>Dosya Yükleniyor... %{uploadProgress}</span>
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}
                    <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                      {/* DOSYA EKLEME BUTONU */}
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-[#1c1c21] hover:bg-white/5 border border-white/10 rounded-2xl text-zinc-400 hover:text-white transition-all shrink-0" title="Dosya/Fotoğraf Ekle">
                        📎
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                      
                      <input type="text" value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="Bir mesaj gönder..." className="flex-1 bg-[#1c1c21] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none" />
                      <button type="submit" disabled={!messageText.trim()} className="p-3 bg-indigo-600 rounded-2xl text-white disabled:opacity-30 shrink-0">🚀</button>
                    </form>
                  </div>
                </div>
              )}
            </div>
            
            {activeTab.startsWith('server-') && showMembersList && (
              <div className="w-[200px] bg-[#121214] border-l border-white/5 p-3 overflow-y-auto shrink-0">
                <div className="text-[10px] font-bold text-zinc-500 mb-2 tracking-wider">ÜYELER</div>
                {allUsers.filter(u => activeServer?.members?.includes(u.uid)).map(u => (
                  <div key={u.uid} className="flex items-center gap-2 mb-2"><img src={u.avatar} className="w-6 h-6 rounded-full object-cover" /><span className="text-xs truncate font-bold">{u.displayName}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AYARLAR MODALI */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
          <div className="bg-[#121214] p-6 rounded-3xl w-full max-w-sm border border-white/10">
            <h3 className="text-lg font-bold text-white mb-4">Ayarlar</h3>
            <div className="space-y-2">
              <button onClick={handleLogout} className="w-full py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-white text-sm transition-all">Çıkış Yap</button>
              <button onClick={handleDeleteAccount} className="w-full py-3 border border-rose-500/20 text-rose-500 rounded-xl font-bold text-sm transition-all">Hesabımı Tamamen Sil</button>
              <button onClick={() => setShowProfileModal(false)} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-zinc-300 text-sm transition-all mt-4">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* SUNUCU KURMA MODALI */}
      {showNewServerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121214] border border-white/10 rounded-3xl p-6">
            <h3 className="text-xl font-bold mb-4 text-white">Yeni Sunucu Kur</h3>
            <form onSubmit={handleCreateServer}>
              <input type="text" value={newServerName} onChange={e => setNewServerName(e.target.value)} placeholder="Sunucu Adı" className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 mb-4 text-white text-sm outline-none" required />
              <div className="flex gap-2"><button type="button" onClick={() => setShowNewServerModal(false)} className="flex-1 py-3 bg-zinc-800 rounded-xl text-sm font-bold">İptal</button><button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">Kur</button></div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}