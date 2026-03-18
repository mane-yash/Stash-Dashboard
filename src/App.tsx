import React, { useState, useEffect, useRef } from 'react';
import './App.css'; 
import { supabase } from './supabaseClient'; 
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Home, BookOpen, Share2, Send, Users, Trash2,
  Search, Plus, FileText, Image as ImageIcon,
  Loader, CheckCircle, File, Sparkles, Folder,
  MoreHorizontal, CloudLightning, Phone, LogOut, User 
} from 'lucide-react';

// --- CONFIGURATION ---
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const BOT_PHONE_NUMBER = import.meta.env.VITE_BOT_PHONE_NUMBER; 
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export default function App() {
  const [userPhone, setUserPhone] = useState(localStorage.getItem('stash_user_phone') || null);
  const [userName, setUserName] = useState(localStorage.getItem('stash_user_name') || null);

  const [loginInput, setLoginInput] = useState('');
  const [nameInput, setNameInput] = useState(''); 

  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [activeTab, setActiveTab] = useState('home');

  // 🛑 NEW: Tracks which Folder the user is currently looking inside!
  const [selectedFolder, setSelectedFolder] = useState(null);

  const [uploadState, setUploadState] = useState('idle');
  const [isHoveringUpload, setIsHoveringUpload] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [realFiles, setRealFiles] = useState([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [contacts, setContacts] = useState({});

  const fileInputRef = useRef(null);

  // 🛑 NEW: Reset the selected folder to null whenever the user clicks a different sidebar tab
  useEffect(() => {
    setSelectedFolder(null);
  }, [activeTab]);

  useEffect(() => {
    if (userPhone) {
      fetchMyStash();

      const subscription = supabase
        .channel('public:files')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'files' }, (payload) => {
          if (payload.new.phone_number === userPhone || payload.new.shared_by === userPhone) {
            fetchMyStash(); 
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [userPhone]);

  async function fetchMyStash() {
    try {
      setIsLoadingDb(true);

      const { data: filesData, error } = await supabase
        .from('files')
        .select('*')
        .or(`phone_number.eq.${userPhone},shared_by.eq.${userPhone}`) 
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRealFiles(filesData || []);

      if (filesData && filesData.length > 0) {
        const uniqueNumbers = new Set();
        filesData.forEach(f => {
          if (f.phone_number) uniqueNumbers.add(f.phone_number);
          if (f.shared_by) uniqueNumbers.add(f.shared_by);
        });

        const { data: usersData } = await supabase
          .from('users')
          .select('phone_number, name')
          .in('phone_number', Array.from(uniqueNumbers));

        if (usersData) {
          const nameMap = {};
          usersData.forEach(u => {
            if (u.name) nameMap[u.phone_number] = u.name;
          });
          setContacts(nameMap); 
        }
      }

    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setIsLoadingDb(false);
    }
  }

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return alert("Please enter your name first!");

    const cleanPhone = loginInput.replace(/\D/g, ''); 
    if (cleanPhone.length < 5) return alert("Please enter a valid phone number.");

    setIsAuthenticating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone })
      });
      const data = await res.json();

      if (data.success) {
        setShowOtpScreen(true);
      } else {
        alert("Failed to send OTP.");
      }
    } catch (err) {
      alert("Error connecting to backend. Is your Replit running and URL correct?");
    }
    setIsAuthenticating(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    const cleanPhone = loginInput.replace(/\D/g, '');

    setIsAuthenticating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, otp: otpInput })
      });
      const data = await res.json();

      if (data.success) {
        const finalName = nameInput.trim();

        await supabase.from('users').upsert([{ 
          phone_number: cleanPhone, 
          name: finalName 
        }], { onConflict: 'phone_number' });

        setUserPhone(cleanPhone);
        setUserName(finalName);
        localStorage.setItem('stash_user_phone', cleanPhone);
        localStorage.setItem('stash_user_name', finalName);

        setShowOtpScreen(false);
        setOtpInput('');
      } else {
        alert("Invalid OTP code! Please try again.");
      }
    } catch (err) {
      alert("Error verifying OTP.");
    }
    setIsAuthenticating(false);
  };

  const handleLogout = () => {
    setUserPhone(null);
    setUserName(null);
    localStorage.removeItem('stash_user_phone');
    localStorage.removeItem('stash_user_name');
    setRealFiles([]);
    setShowOtpScreen(false);
  };

  const fileToGenerativePart = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result.split(",")[1];
        resolve({ inlineData: { data: base64Data, mimeType: file.type } });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUploadClick = () => {
    if (uploadState !== 'idle') return;
    fileInputRef.current?.click(); 
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadState('uploading');

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are an AI assistant for students. Analyze this document/image. 
      Identify the academic 'subject' (e.g., Physics) and 'topic' (e.g., Thermodynamics).
      Respond ONLY with valid JSON. Format: {"subject": "Physics", "topic": "Thermodynamics"}`;

      const imagePart = await fileToGenerativePart(file);
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;

      const text = response.text().replace(/```json|```/g, "").trim(); 
      const metadata = JSON.parse(text);

      const uniqueFileName = `${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('stash_files')
        .upload(uniqueFileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('stash_files')
        .getPublicUrl(uniqueFileName);

      const { error: dbError } = await supabase
        .from('files')
        .insert([{
          phone_number: userPhone,
          file_name: file.name,
          file_url: publicUrl,
          subject: metadata.subject || 'Uncategorized',
          topic: metadata.topic || 'General',
          type: file.type.includes('pdf') ? 'pdf' : 'image'
        }]);

      if (dbError) throw dbError;

      setUploadState('success');
      setTimeout(() => setUploadState('idle'), 3000);

    } catch (err) {
      console.error("AI Upload failed:", err);
      alert("AI Analysis or Upload failed.");
      setUploadState('idle');
    }
  };

  const handleMouseMove = (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    setMousePos({ x, y });
  };

  if (!userPhone) {
    return (
      <div className="flex h-screen w-full bg-[#09090b] items-center justify-center relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="bg-white/5 border border-white/10 p-10 rounded-3xl backdrop-blur-xl w-full max-w-md z-10 text-center shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-500/20 p-4 rounded-full">
              <CloudLightning className="text-indigo-400 w-12 h-12" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Join Stash</h1>

          {!showOtpScreen ? (
            <>
              <p className="text-slate-400 mb-8">Create your profile to start stashing.</p>
              <form onSubmit={handleSendOTP} className="flex flex-col gap-4">

                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input 
                    type="text" placeholder="Your Name (e.g. Rohan)" 
                    value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white outline-none focus:border-indigo-500 transition-colors" required
                  />
                </div>

                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input 
                    type="text" placeholder="WhatsApp Number (e.g. 919876543210)" 
                    value={loginInput} onChange={(e) => setLoginInput(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white outline-none focus:border-indigo-500 transition-colors" required
                  />
                </div>
                <p className="text-xs text-slate-500 text-left -mt-2 ml-1">Include country code. No '+' sign.</p>

                <button type="submit" disabled={isAuthenticating} className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-bold py-3 rounded-xl transition-all mt-2">
                  {isAuthenticating ? "Sending..." : "Send OTP via WhatsApp"}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-slate-400 mb-8">We sent a code to WhatsApp: <b>+{loginInput}</b></p>
              <form onSubmit={handleVerifyOTP} className="flex flex-col gap-4">
                <input 
                  type="text" placeholder="Enter 6-digit code" 
                  value={otpInput} onChange={(e) => setOtpInput(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-center tracking-widest text-xl outline-none focus:border-emerald-500" maxLength={6} required
                />
                <button type="submit" disabled={isAuthenticating} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-bold py-3 rounded-xl transition-all">
                  {isAuthenticating ? "Verifying..." : "Verify Code & Join"}
                </button>
                <button type="button" onClick={() => setShowOtpScreen(false)} className="text-slate-400 text-sm hover:text-white mt-2">
                  Wrong number? Go back.
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // 🛑 NEW: Master function that renders either the Folders OR the files inside a selected Folder
  const renderFolderView = (filesToGroup, title, type, emptyMsg) => {
    // 1. If a folder is selected, show the files inside it
    if (selectedFolder) {
      const folderFiles = filesToGroup.filter(f => (f.subject || 'Uncategorized') === selectedFolder);
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={() => setSelectedFolder(null)} 
              className="text-slate-400 hover:text-white flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10 transition-all hover:bg-white/10 font-semibold text-sm shadow-sm"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3 capitalize">
              <Folder className="text-indigo-400 w-7 h-7" fill="currentColor" opacity={0.2} /> 
              {selectedFolder}
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {folderFiles.map((file) => (
              <FileCard key={file.id} file={file} type={type} contacts={contacts} />
            ))}
            {folderFiles.length === 0 && <p className="text-slate-500 col-span-full">No files in this folder.</p>}
          </div>
        </div>
      );
    }

    // 2. If no folder is selected, group the files by Subject and show Folder Cards
    const grouped = filesToGroup.reduce((acc, file) => {
      const subj = file.subject || 'Uncategorized';
      if (!acc[subj]) acc[subj] = [];
      acc[subj].push(file);
      return acc;
    }, {});

    const subjects = Object.keys(grouped);

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {subjects.map(subj => (
            <FolderCard 
              key={subj} 
              subject={subj} 
              count={grouped[subj].length} 
              onClick={() => setSelectedFolder(subj)} 
            />
          ))}
          {subjects.length === 0 && <p className="text-slate-500 col-span-full">{emptyMsg}</p>}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    const myUploads = realFiles.filter(f => f.phone_number === userPhone && !f.shared_by);
    const sharedWithMe = realFiles.filter(f => f.phone_number === userPhone && f.shared_by);
    const sharedByMe = realFiles.filter(f => f.shared_by === userPhone);
    const recentFiles = realFiles.filter(f => f.phone_number === userPhone).slice(0, 6);

    switch (activeTab) {
      case 'home':
        return (
          <div className="flex-1 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
              <div className="flex items-end justify-between mb-5 px-2">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Recent Files</h2>
                  <p className="text-sm text-slate-400 mt-1">Jump back into your latest study materials.</p>
                </div>
                <button onClick={() => setActiveTab('library')} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">View All</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {recentFiles.map((file) => (
                  <FileCard key={file.id} file={file} type="recent" contacts={contacts} />
                ))}
                {recentFiles.length === 0 && !isLoadingDb && (
                  <div className="col-span-full text-center py-8 text-slate-500 bg-white/[0.02] rounded-xl border border-white/5">
                    No files stashed yet. Upload one below or send it via WhatsApp!
                  </div>
                )}
              </div>
            </section>

            <section className="flex-1 flex flex-col min-h-[320px]">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              <div onClick={handleUploadClick} onMouseEnter={() => setIsHoveringUpload(true)} onMouseLeave={() => setIsHoveringUpload(false)} className={`flex-1 w-full rounded-[2rem] flex flex-col items-center justify-center cursor-pointer transition-all duration-500 relative overflow-hidden backdrop-blur-xl ${uploadState === 'idle' ? 'bg-white/5 border-2 border-dashed border-white/20 hover:border-indigo-500/50' : uploadState === 'uploading' ? 'bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 border-2 border-indigo-500/30' : 'bg-emerald-500/10 border-2 border-emerald-500/30'}`}>
                {uploadState === 'idle' && (
                  <div className="flex flex-col items-center z-10 text-center">
                    <Plus size={48} className={`text-indigo-400 mb-4 transition-transform duration-500 ${isHoveringUpload ? 'rotate-90 scale-110' : ''}`} />
                    <h2 className="text-2xl font-bold text-white mb-2">Stash a new file</h2>
                    <p className="text-slate-400 px-8 text-sm">Click to upload. AI will automatically scan and categorize it.</p>
                  </div>
                )}
                {uploadState === 'uploading' && (
                  <div className="flex flex-col items-center z-10 text-center"><Loader size={48} className="text-indigo-400 animate-spin mb-4" /><h2 className="text-2xl font-bold text-white mb-2">AI Analyzing...</h2></div>
                )}
                {uploadState === 'success' && (
                  <div className="flex flex-col items-center z-10 text-center"><CheckCircle size={48} className="text-emerald-400 mb-4" /><h2 className="text-2xl font-bold text-emerald-400 mb-2">File Categorized!</h2></div>
                )}
              </div>
            </section>
          </div>
        );

      // 🛑 The 3 main tabs now strictly use the Folder View logic!
      case 'library':
        return renderFolderView(myUploads, "My Personal Library", "personal", "You haven't uploaded anything yet.");
      case 'shared-with':
        return renderFolderView(sharedWithMe, "Shared With Me", "shared-with", "No one has shared files with you yet.");
      case 'shared-by':
        return renderFolderView(sharedByMe, "Shared By Me", "shared-by", "You haven't sent any files to friends yet.");
      default:
        return null;
    }
  };

  return (
    <div onMouseMove={handleMouseMove} className="flex h-screen w-full bg-[#09090b] text-slate-200 font-sans overflow-hidden relative z-0">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/30 blur-[120px] pointer-events-none -z-10" style={{ transform: `translate(${mousePos.x * 40}px, ${mousePos.y * 40}px)` }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/20 blur-[120px] pointer-events-none -z-10" style={{ transform: `translate(${mousePos.x * -50}px, ${mousePos.y * -50}px)` }} />

      <aside className="w-[260px] bg-white/[0.02] border-r border-white/10 p-6 flex flex-col z-10 backdrop-blur-2xl">
        <div className="mb-10 pl-2 flex items-center gap-3">
          <CloudLightning className="text-indigo-400 w-8 h-8" />
          <span className="font-bold text-2xl text-white">Stash</span>
        </div>

        <nav className="flex flex-col gap-2">
          <NavItem icon={<Home size={18} />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavItem icon={<BookOpen size={18} />} label="My Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
          <NavItem icon={<Share2 size={18} />} label="Shared with me" active={activeTab === 'shared-with'} onClick={() => setActiveTab('shared-with')} />
          <NavItem icon={<Send size={18} />} label="Shared by me" active={activeTab === 'shared-by'} onClick={() => setActiveTab('shared-by')} />
        </nav>

        <div className="mt-auto pt-8 flex flex-col gap-3">
          <div className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl p-4 text-center">
            <h4 className="text-[#25D366] font-bold text-sm mb-2">Stash on the go</h4>
            <p className="text-slate-400 text-xs mb-4">Send links and files directly to our AI WhatsApp bot.</p>
            <button onClick={() => window.open(`https://wa.me/${BOT_PHONE_NUMBER}?text=Hey%20Stash!`, '_blank')} className="w-full bg-[#25D366] hover:bg-[#20b858] text-gray-900 font-bold py-2 rounded-lg text-sm transition-all">
              Open WhatsApp
            </button>
          </div>
          <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full text-slate-400 hover:text-red-400 hover:bg-red-400/10 py-3 rounded-xl font-semibold text-sm transition-all">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-8 gap-8 z-10">
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between px-4 py-3 backdrop-blur-xl shrink-0">
          <div className="flex items-center flex-1">
            <Search className="text-slate-400 w-5 h-5 mr-3" />
            <input type="text" placeholder="Search your stash with AI..." className="bg-transparent outline-none w-full text-white" />
          </div>
          <div className="text-sm font-semibold text-indigo-300 bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20 flex items-center gap-2">
            <User size={16} /> Hey, {userName || userPhone} 👋
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

// 🛑 NEW: BEAUTIFUL FOLDER CARD COMPONENT
function FolderCard({ subject, count, onClick }) {
  return (
    <div 
      onClick={onClick} 
      className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col hover:border-indigo-500/50 hover:bg-white/10 cursor-pointer transition-all h-full min-h-[160px] shadow-sm group"
    >
      <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 mb-4 shrink-0 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
        <Folder size={28} fill="currentColor" className="opacity-80" />
      </div>

      <div className="flex flex-col flex-1 mt-auto">
        <h3 className="font-bold text-white text-lg leading-snug mb-1 truncate capitalize">
          {subject}
        </h3>
        <p className="text-sm font-semibold text-indigo-300">
          {count} {count === 1 ? 'file' : 'files'}
        </p>
      </div>
    </div>
  );
}

// --- CLEAN UI FILE CARD COMPONENT ---
function FileCard({ file, type, contacts }) {
  const dateStr = file.created_at 
    ? new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
    : 'Unknown Date';

  let sharedBadge = (
    <span className="text-xs font-semibold text-slate-300 bg-slate-700/50 px-2.5 py-1 rounded-md border border-slate-600/50 w-fit mt-1">
      Personal
    </span>
  );

  if (type === 'shared-with' || (type === 'recent' && file.shared_by)) {
    sharedBadge = (
      <span className="text-xs font-bold text-fuchsia-300 bg-fuchsia-500/20 px-2.5 py-1 rounded-md border border-fuchsia-500/30 w-fit mt-1">
        Shared by {contacts[file.shared_by] || '+' + file.shared_by}
      </span>
    );
  } else if (type === 'shared-by') {
    sharedBadge = (
      <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/30 w-fit mt-1">
        Sent to {contacts[file.phone_number] || '+' + file.phone_number}
      </span>
    );
  }

  const displayTitle = file.topic && file.topic !== 'General' 
    ? file.topic 
    : `${file.subject || 'Document'} Notes`;

  return (
    <div 
      onClick={() => window.open(file.file_url, '_blank')} 
      className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col hover:border-indigo-500/50 hover:bg-white/10 cursor-pointer transition-all h-full min-h-[220px]"
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-500/20 text-indigo-400 mb-4 shrink-0 shadow-sm border border-indigo-500/20">
        {file.type === 'image' ? <ImageIcon size={24} /> : <FileText size={24} />}
      </div>

      <div className="flex flex-col flex-1">
        <h3 className="font-bold text-white text-base leading-snug mb-1.5 line-clamp-2 capitalize">
          {displayTitle}
        </h3>

        <p className="text-sm font-semibold text-indigo-300 mb-1 flex items-center gap-2">
          <span className="truncate">{file.subject || 'Uncategorized'}</span>
          <span className="text-[9px] bg-white/10 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
            {file.type === 'image' ? 'IMG' : 'PDF'}
          </span>
        </p>

        {sharedBadge}
      </div>

      <div className="mt-auto pt-4 border-t border-white/10">
        <p className="text-xs text-slate-400 font-medium">{dateStr}</p>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-500/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
      {icon} <span>{label}</span>
    </button>
  );
}