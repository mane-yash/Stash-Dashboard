import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Home,
  BookOpen,
  Share2,
  Send,
  Users,
  Trash2,
  Search,
  Plus,
  FileText,
  Image as ImageIcon,
  Loader,
  CheckCircle,
  File,
  Sparkles,
  Folder,
  MoreHorizontal,
  CloudLightning,
  Phone,
  LogOut,
  User,
  Menu,
  X,
} from "lucide-react";

// --- CONFIGURATION ---
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const BOT_PHONE_NUMBER = import.meta.env.VITE_BOT_PHONE_NUMBER;
const BACKEND_URL = "https://placentate-nonemotionally-lon.ngrok-free.dev";

export default function App() {
  const [userPhone, setUserPhone] = useState(
    localStorage.getItem("stash_user_phone") || null,
  );
  const [userName, setUserName] = useState(
    localStorage.getItem("stash_user_name") || null,
  );

  const [loginInput, setLoginInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [activeTab, setActiveTab] = useState("home");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [selectedFolder, setSelectedFolder] = useState(null);

  const [uploadState, setUploadState] = useState("idle");
  const [isHoveringUpload, setIsHoveringUpload] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [realFiles, setRealFiles] = useState([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [contacts, setContacts] = useState({});

  // 🛑 NEW: State for the Onboarding Popup
  const [showOnboardingPopup, setShowOnboardingPopup] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    setSelectedFolder(null);
  }, [activeTab]);

  useEffect(() => {
    if (userPhone) {
      fetchMyStash();

      const subscription = supabase
        .channel("public:files")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "files" },
          (payload) => {
            if (
              payload.new.phone_number === userPhone ||
              payload.new.shared_by === userPhone
            ) {
              fetchMyStash();
            }
          },
        )
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
        .from("files")
        .select("*")
        .or(`phone_number.eq.${userPhone},shared_by.eq.${userPhone}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRealFiles(filesData || []);

      if (filesData && filesData.length > 0) {
        const uniqueNumbers = new Set();
        filesData.forEach((f) => {
          if (f.phone_number) uniqueNumbers.add(f.phone_number);
          if (f.shared_by) uniqueNumbers.add(f.shared_by);
        });

        const { data: usersData } = await supabase
          .from("users")
          .select("phone_number, name")
          .in("phone_number", Array.from(uniqueNumbers));

        if (usersData) {
          const nameMap = {};
          usersData.forEach((u) => {
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

    const cleanPhone = loginInput.replace(/\D/g, "");
    if (cleanPhone.length < 5)
      return alert("Please enter a valid phone number.");

    setIsAuthenticating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();

      if (data.success) {
        setShowOtpScreen(true);
      } else {
        alert("Failed to send OTP.");
      }
    } catch (err) {
      alert(
        "Error connecting to backend. Is your Replit running and URL correct?",
      );
    }
    setIsAuthenticating(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    const cleanPhone = loginInput.replace(/\D/g, "");

    setIsAuthenticating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, otp: otpInput }),
      });
      const data = await res.json();

      if (data.success) {
        const finalName = nameInput.trim();

        await supabase.from("users").upsert(
          [
            {
              phone_number: cleanPhone,
              name: finalName,
            },
          ],
          { onConflict: "phone_number" },
        );

        setUserPhone(cleanPhone);
        setUserName(finalName);
        localStorage.setItem("stash_user_phone", cleanPhone);
        localStorage.setItem("stash_user_name", finalName);

        setShowOtpScreen(false);
        setOtpInput("");

        // 🛑 NEW: Trigger the popup exactly when they successfully log in
        setShowOnboardingPopup(true);
      } else {
        alert("Invalid OTP code! Please try again.");
      }
    } catch (err) {
      alert("Error verifying OTP.");
    }
    setIsAuthenticating(false);
  };

  // 🛑 NEW: The trigger function for the backend
  const triggerWhatsAppMessage = async (delayAmount) => {
    try {
      await fetch(`${BACKEND_URL}/api/trigger-onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420",
        },
        body: JSON.stringify({
          phone: userPhone,
          delay: delayAmount,
        }),
      });
      console.log(`Triggered message with ${delayAmount}s delay.`);
    } catch (error) {
      console.error("Failed to trigger onboarding message", error);
    }
  };

  // 🛑 NEW: Actions for the Popup buttons
  const handleOpenWhatsAppClick = () => {
    setShowOnboardingPopup(false);
    triggerWhatsAppMessage(0); // Instantly send message
    window.open(`https://wa.me/${BOT_PHONE_NUMBER}`, "_blank");
  };

  const handleClosePopup = () => {
    setShowOnboardingPopup(false);
    triggerWhatsAppMessage(15); // Wait 15 seconds to send message
  };

  const handleLogout = () => {
    setUserPhone(null);
    setUserName(null);
    localStorage.removeItem("stash_user_phone");
    localStorage.removeItem("stash_user_name");
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
    if (uploadState !== "idle") return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadState("uploading");

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are an AI assistant for students. Analyze this document/image. 
      Identify the academic 'subject' (e.g., Physics) and 'topic' (e.g., Thermodynamics).
      Respond ONLY with valid JSON. Format: {"subject": "Physics", "topic": "Thermodynamics"}`;

      const imagePart = await fileToGenerativePart(file);
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;

      const text = response
        .text()
        .replace(/```json|```/g, "")
        .trim();
      const metadata = JSON.parse(text);

      const uniqueFileName = `${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("stash_files")
        .upload(uniqueFileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("stash_files").getPublicUrl(uniqueFileName);

      const { error: dbError } = await supabase.from("files").insert([
        {
          phone_number: userPhone,
          file_name: file.name,
          file_url: publicUrl,
          subject: metadata.subject || "Uncategorized",
          topic: metadata.topic || "General",
          type: file.type.includes("pdf") ? "pdf" : "image",
        },
      ]);

      if (dbError) throw dbError;

      setUploadState("success");
      setTimeout(() => setUploadState("idle"), 3000);
    } catch (err) {
      console.error("AI Upload failed:", err);
      alert("AI Analysis or Upload failed.");
      setUploadState("idle");
    }
  };

  const handleMouseMove = (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    setMousePos({ x, y });
  };

  // 🛑 NEW: Split-Screen SaaS Layout for the Login Screen
  if (!userPhone) {
    return (
      <div className="flex h-screen w-full bg-[#09090b] relative overflow-hidden font-sans">

        {/* Background Orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] pointer-events-none" />

        {/* LEFT COLUMN (Value Proposition - Hidden on Mobile, Shows on Desktop) */}
        <div className="hidden lg:flex w-1/2 flex-col justify-center px-16 xl:px-24 z-10 border-r border-white/5 bg-black/20 backdrop-blur-sm">
          <div className="bg-indigo-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
            <CloudLightning className="text-indigo-400 w-8 h-8" />
          </div>

          <h1 className="text-5xl xl:text-6xl font-extrabold text-white mb-6 leading-tight tracking-tight">
            Never lose a <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">study guide</span> in the group chat again.
          </h1>

          <p className="text-lg text-slate-400 mb-12 max-w-lg leading-relaxed">
            Stash is your AI-powered library. Just forward your notes, PDFs, and whiteboard photos to our WhatsApp bot, and we handle the rest.
          </p>

          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-5">
              <div className="bg-indigo-500/10 p-3.5 rounded-xl border border-indigo-500/20"><Folder className="text-indigo-400 w-6 h-6" /></div>
              <div>
                <h3 className="text-white font-bold text-lg">Auto-Categorization</h3>
                <p className="text-slate-400 text-sm">AI instantly tags subjects and topics.</p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/20"><Search className="text-emerald-400 w-6 h-6" /></div>
              <div>
                <h3 className="text-white font-bold text-lg">Instant Retrieval</h3>
                <p className="text-slate-400 text-sm">Type /stash to pull up exact notes.</p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="bg-fuchsia-500/10 p-3.5 rounded-xl border border-fuchsia-500/20"><Share2 className="text-fuchsia-400 w-6 h-6" /></div>
              <div>
                <h3 className="text-white font-bold text-lg">Seamless Sharing</h3>
                <p className="text-slate-400 text-sm">Push notes directly to friends' libraries.</p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (The Login Form) */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 z-10 relative">
          <div className="bg-white/5 border border-white/10 p-8 md:p-10 rounded-3xl backdrop-blur-xl w-full max-w-md text-center shadow-2xl">

            {/* Mobile Logo (Only shows on small screens) */}
            <div className="flex lg:hidden justify-center mb-6">
              <div className="bg-indigo-500/20 p-4 rounded-full border border-indigo-500/30">
                <CloudLightning className="text-indigo-400 w-10 h-10" />
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">Join Stash</h2>

            {!showOtpScreen ? (
              <>
                <p className="text-slate-400 mb-8 text-sm">Create your profile to start stashing.</p>
                <form onSubmit={handleSendOTP} className="flex flex-col gap-4">

                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 w-5 h-5 transition-colors" />
                    <input 
                      type="text" placeholder="Your Name (e.g. Rohan)" 
                      value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white outline-none focus:border-indigo-500 focus:bg-black/60 transition-all" required
                    />
                  </div>

                  <div className="relative group">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 w-5 h-5 transition-colors" />
                    <input 
                      type="text" placeholder="WhatsApp Number (e.g. 919876543210)" 
                      value={loginInput} onChange={(e) => setLoginInput(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white outline-none focus:border-indigo-500 focus:bg-black/60 transition-all" required
                    />
                  </div>
                  <p className="text-xs text-slate-500 text-left ml-1 mt-1">Include country code. No '+' sign.</p>

                  <button type="submit" disabled={isAuthenticating} className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-bold py-3.5 rounded-xl transition-all mt-4 shadow-lg shadow-indigo-500/20">
                    {isAuthenticating ? "Sending..." : "Send OTP via WhatsApp"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="text-slate-400 mb-8 text-sm">We sent a secure code to WhatsApp:<br/><b className="text-white text-base mt-1 block">+{loginInput}</b></p>
                <form onSubmit={handleVerifyOTP} className="flex flex-col gap-4">
                  <input 
                    type="text" placeholder="Enter 6-digit code" 
                    value={otpInput} onChange={(e) => setOtpInput(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 px-4 text-white text-center tracking-widest text-2xl font-mono outline-none focus:border-emerald-500 focus:bg-black/60 transition-all" maxLength={6} required
                  />
                  <button type="submit" disabled={isAuthenticating} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-bold py-3.5 rounded-xl transition-all mt-2 shadow-lg shadow-emerald-500/20">
                    {isAuthenticating ? "Verifying..." : "Verify Code & Join"}
                  </button>
                  <button type="button" onClick={() => setShowOtpScreen(false)} className="text-slate-500 text-sm hover:text-white mt-4 underline decoration-slate-600 underline-offset-4 transition-colors">
                    Wrong number? Go back.
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

      </div>
    );
  }

  const renderFolderView = (filesToGroup, title, type, emptyMsg) => {
    if (selectedFolder) {
      const folderFiles = filesToGroup.filter(
        (f) => (f.subject || "Uncategorized") === selectedFolder,
      );
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setSelectedFolder(null)}
              className="text-slate-400 hover:text-white flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10 transition-all hover:bg-white/10 font-semibold text-sm shadow-sm"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3 capitalize truncate">
              <Folder
                className="text-indigo-400 w-7 h-7 shrink-0"
                fill="currentColor"
                opacity={0.2}
              />
              {selectedFolder}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {folderFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                type={type}
                contacts={contacts}
              />
            ))}
            {folderFiles.length === 0 && (
              <p className="text-slate-500 col-span-full">
                No files in this folder.
              </p>
            )}
          </div>
        </div>
      );
    }

    const grouped = filesToGroup.reduce((acc, file) => {
      const subj = file.subject || "Uncategorized";
      if (!acc[subj]) acc[subj] = [];
      acc[subj].push(file);
      return acc;
    }, {});

    const subjects = Object.keys(grouped);

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {subjects.map((subj) => (
            <FolderCard
              key={subj}
              subject={subj}
              count={grouped[subj].length}
              onClick={() => setSelectedFolder(subj)}
            />
          ))}
          {subjects.length === 0 && (
            <p className="text-slate-500 col-span-full">{emptyMsg}</p>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    const myUploads = realFiles.filter(
      (f) => f.phone_number === userPhone && !f.shared_by,
    );
    const sharedWithMe = realFiles.filter(
      (f) => f.phone_number === userPhone && f.shared_by,
    );
    const sharedByMe = realFiles.filter((f) => f.shared_by === userPhone);
    const recentFiles = realFiles
      .filter((f) => f.phone_number === userPhone)
      .slice(0, 6);

    switch (activeTab) {
      case "home":
        return (
          <div className="flex-1 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
              <div className="flex items-end justify-between mb-5 px-2">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Recent Files
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Jump back into your latest study materials.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("library")}
                  className="text-sm font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  View All
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {recentFiles.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    type="recent"
                    contacts={contacts}
                  />
                ))}
                {recentFiles.length === 0 && !isLoadingDb && (
                  <div className="col-span-full text-center py-8 text-slate-500 bg-white/[0.02] rounded-xl border border-white/5">
                    No files stashed yet. Upload one below or send it via
                    WhatsApp!
                  </div>
                )}
              </div>
            </section>

            <section className="flex-1 flex flex-col min-h-[320px]">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={handleUploadClick}
                onMouseEnter={() => setIsHoveringUpload(true)}
                onMouseLeave={() => setIsHoveringUpload(false)}
                className={`flex-1 w-full rounded-[2rem] flex flex-col items-center justify-center cursor-pointer transition-all duration-500 relative overflow-hidden backdrop-blur-xl ${uploadState === "idle" ? "bg-white/5 border-2 border-dashed border-white/20 hover:border-indigo-500/50" : uploadState === "uploading" ? "bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 border-2 border-indigo-500/30" : "bg-emerald-500/10 border-2 border-emerald-500/30"}`}
              >
                {uploadState === "idle" && (
                  <div className="flex flex-col items-center z-10 text-center px-4">
                    <Plus
                      size={48}
                      className={`text-indigo-400 mb-4 transition-transform duration-500 ${isHoveringUpload ? "rotate-90 scale-110" : ""}`}
                    />
                    <h2 className="text-2xl font-bold text-white mb-2">
                      Stash a new file
                    </h2>
                    <p className="text-slate-400 px-2 md:px-8 text-sm">
                      Click to upload. AI will automatically scan and categorize
                      it.
                    </p>
                  </div>
                )}
                {uploadState === "uploading" && (
                  <div className="flex flex-col items-center z-10 text-center">
                    <Loader
                      size={48}
                      className="text-indigo-400 animate-spin mb-4"
                    />
                    <h2 className="text-2xl font-bold text-white mb-2">
                      AI Analyzing...
                    </h2>
                  </div>
                )}
                {uploadState === "success" && (
                  <div className="flex flex-col items-center z-10 text-center">
                    <CheckCircle size={48} className="text-emerald-400 mb-4" />
                    <h2 className="text-2xl font-bold text-emerald-400 mb-2">
                      File Categorized!
                    </h2>
                  </div>
                )}
              </div>
            </section>
          </div>
        );

      case "library":
        return renderFolderView(
          myUploads,
          "My Personal Library",
          "personal",
          "You haven't uploaded anything yet.",
        );
      case "shared-with":
        return renderFolderView(
          sharedWithMe,
          "Shared With Me",
          "shared-with",
          "No one has shared files with you yet.",
        );
      case "shared-by":
        return renderFolderView(
          sharedByMe,
          "Shared By Me",
          "shared-by",
          "You haven't sent any files to friends yet.",
        );
      default:
        return null;
    }
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="flex flex-col md:flex-row h-screen w-full bg-[#09090b] text-slate-200 font-sans overflow-hidden relative z-0"
    >
      {/* Background Orbs */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/30 blur-[120px] pointer-events-none -z-10"
        style={{
          transform: `translate(${mousePos.x * 40}px, ${mousePos.y * 40}px)`,
        }}
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/20 blur-[120px] pointer-events-none -z-10"
        style={{
          transform: `translate(${mousePos.x * -50}px, ${mousePos.y * -50}px)`,
        }}
      />

      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white/5 border-b border-white/10 z-40 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2">
          <CloudLightning className="text-indigo-400 w-6 h-6" />
          <span className="font-bold text-xl text-white">Stash</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="text-white p-1"
        >
          {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Responsive Sidebar */}
      <aside
        className={`
        fixed md:static inset-y-0 left-0 z-50 w-[260px] bg-[#09090b] md:bg-white/[0.02] border-r border-white/10 p-6 flex flex-col backdrop-blur-2xl transition-transform duration-300
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} 
        md:translate-x-0
      `}
      >
        <div className="mb-10 pl-2 hidden md:flex items-center gap-3">
          <CloudLightning className="text-indigo-400 w-8 h-8" />
          <span className="font-bold text-2xl text-white">Stash</span>
        </div>

        <nav className="flex flex-col gap-2 mt-12 md:mt-0">
          <NavItem
            icon={<Home size={18} />}
            label="Home"
            active={activeTab === "home"}
            onClick={() => {
              setActiveTab("home");
              setIsMobileMenuOpen(false);
            }}
          />
          <NavItem
            icon={<BookOpen size={18} />}
            label="My Library"
            active={activeTab === "library"}
            onClick={() => {
              setActiveTab("library");
              setIsMobileMenuOpen(false);
            }}
          />
          <NavItem
            icon={<Share2 size={18} />}
            label="Shared with me"
            active={activeTab === "shared-with"}
            onClick={() => {
              setActiveTab("shared-with");
              setIsMobileMenuOpen(false);
            }}
          />
          <NavItem
            icon={<Send size={18} />}
            label="Shared by me"
            active={activeTab === "shared-by"}
            onClick={() => {
              setActiveTab("shared-by");
              setIsMobileMenuOpen(false);
            }}
          />
        </nav>

        <div className="mt-auto pt-8 flex flex-col gap-3">
          <div className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl p-4 text-center hidden md:block">
            <h4 className="text-[#25D366] font-bold text-sm mb-2">
              Stash on the go
            </h4>
            <p className="text-slate-400 text-xs mb-4">
              Send study material directly to our AI WhatsApp bot.
            </p>
            <button
              onClick={() =>
                window.open(
                  `https://wa.me/${BOT_PHONE_NUMBER}?text=Hey%20Stash!`,
                  "_blank",
                )
              }
              className="w-full bg-[#25D366] hover:bg-[#20b858] text-gray-900 font-bold py-2 rounded-lg text-sm transition-all"
            >
              Open WhatsApp
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full text-slate-400 hover:text-red-400 hover:bg-red-400/10 py-3 rounded-xl font-semibold text-sm transition-all"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 md:p-8 gap-4 md:gap-8 z-10 w-full overflow-hidden relative">
        {/* Search Header */}
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between px-3 md:px-4 py-3 backdrop-blur-xl shrink-0">
          <div className="flex items-center flex-1">
            <Search className="text-slate-400 w-5 h-5 mr-3 shrink-0" />
            <input
              type="text"
              placeholder="Search your stash..."
              className="bg-transparent outline-none w-full text-white text-sm"
            />
          </div>
          <div className="hidden md:flex text-sm font-semibold text-indigo-300 bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20 items-center gap-2 ml-4">
            <User size={16} /> Hey, {userName || userPhone} 👋
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-8">
          {renderContent()}
        </div>

        {/* 🛑 NEW: The Onboarding Popup Overlay */}
        {showOnboardingPopup && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-[#1E1E2E] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center relative shadow-2xl animate-in zoom-in-95 duration-300">
              <button
                onClick={handleClosePopup}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={24} />
              </button>

              <div className="bg-[#25D366]/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <CloudLightning className="text-[#25D366] w-8 h-8" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">
                Stash on the go ⚡
              </h2>
              <p className="text-slate-400 mb-6">
                Send study material directly to our AI WhatsApp bot.
              </p>

              <button
                onClick={handleOpenWhatsAppClick}
                className="w-full bg-[#25D366] hover:bg-[#20b858] text-gray-900 font-bold py-3 rounded-xl transition-all shadow-lg shadow-[#25D366]/20"
              >
                Open WhatsApp
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Folder Card Component
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
          {count} {count === 1 ? "file" : "files"}
        </p>
      </div>
    </div>
  );
}

// File Card Component
function FileCard({ file, type, contacts }) {
  const dateStr = file.created_at
    ? new Date(file.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown Date";

  // 🛑 THE FIX: Smart check! If 'type' is missing, check the file name extension for images
  const isImage =
    file.type === "image" ||
    (file.file_name && /\.(jpg|jpeg|png|gif|webp)$/i.test(file.file_name));

  let sharedBadge = (
    <span className="text-xs font-semibold text-slate-300 bg-slate-700/50 px-2.5 py-1 rounded-md border border-slate-600/50 w-fit mt-1">
      Personal
    </span>
  );

  if (type === "shared-with" || (type === "recent" && file.shared_by)) {
    sharedBadge = (
      <span className="text-xs font-bold text-fuchsia-300 bg-fuchsia-500/20 px-2.5 py-1 rounded-md border border-fuchsia-500/30 w-fit mt-1 truncate max-w-full">
        Shared by {contacts[file.shared_by] || "+" + file.shared_by}
      </span>
    );
  } else if (type === "shared-by") {
    sharedBadge = (
      <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/30 w-fit mt-1 truncate max-w-full">
        Sent to {contacts[file.phone_number] || "+" + file.phone_number}
      </span>
    );
  }

  const displayTitle =
    file.topic && file.topic !== "General"
      ? file.topic
      : `${file.subject || "Document"} Notes`;

  return (
    <div
      onClick={() => window.open(file.file_url, "_blank")}
      className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col hover:border-indigo-500/50 hover:bg-white/10 cursor-pointer transition-all h-full min-h-[220px]"
    >
      {/* 🛑 Updated Icon Check */}
      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-500/20 text-indigo-400 mb-4 shrink-0 shadow-sm border border-indigo-500/20">
        {isImage ? <ImageIcon size={24} /> : <FileText size={24} />}
      </div>

      <div className="flex flex-col flex-1">
        <h3 className="font-bold text-white text-base leading-snug mb-1.5 line-clamp-2 capitalize">
          {displayTitle}
        </h3>

        <p className="text-sm font-semibold text-indigo-300 mb-1 flex items-center gap-2 overflow-hidden">
          <span className="truncate">{file.subject || "Uncategorized"}</span>

          {/* 🛑 Updated Badge Check */}
          <span className="text-[9px] bg-white/10 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
            {isImage ? "IMG" : "PDF"}
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
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left ${active ? "bg-indigo-500/10 text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}
    >
      {icon} <span>{label}</span>
    </button>
  );
}
