import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://bnnvhxbhrfhazexhorau.supabase.co",
  "sb_publishable_E8mhg8To_e8LO_L7f2-i6Q_dtcrxpGa"
);

const ACCENT = "#00FF87";
const ACCENT2 = "#00CFFF";
const CARD = "#141414";
const CARD2 = "#1c1c1c";
const sampleAvatars = ["💪","🏋️","🔥","⚡","🥊","🎯","🏃","💥","🦾","🏆"];

function generateCode() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}
function venmoLink(username: string, amount: number, note: string) {
  return `https://venmo.com/${username}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`;
}

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [challenge, setChallenge] = useState<any>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [currentDay, setCurrentDay] = useState(1);
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [tlFrame, setTlFrame] = useState(0);
  const [tlPlaying, setTlPlaying] = useState(false);
  const [tlSpeed, setTlSpeed] = useState(1);
  const [showPayModal, setShowPayModal] = useState<any>(null);
  const [cameraStream, setCameraStream] = useState<any>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string|null>(null);
  const [gps, setGps] = useState<any>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ name:"", duration:30, wager:50, venmo:"", myName:"" });
  const [joinForm, setJoinForm] = useState({ code:"", myName:"", venmo:"" });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const pid = localStorage.getItem("gymwager_participant_id");
    const cid = localStorage.getItem("gymwager_challenge_id");
    if (code) {
      setJoinForm(f => ({ ...f, code }));
      setScreen("join");
    } else if (pid && cid) {
      resumeSession(cid, pid);
    } else {
      setScreen("home");
    }
  }, []);

  async function resumeSession(cid: string, pid: string) {
    setLoading(true);
    try {
      const { data: c } = await supabase.from("challenges").select().eq("id", cid).single();
      const { data: p } = await supabase.from("participants").select().eq("id", pid).single();
      const { data: ps } = await supabase.from("participants").select().eq("challenge_id", cid);
      const { data: ci } = await supabase.from("checkins").select().eq("challenge_id", cid);
      if (c && p) {
        setChallenge(c); setParticipant(p); setParticipants(ps || []); setCheckins(ci || []);
        const day = calcCurrentDay(c);
        setCurrentDay(day);
        setScreen(c.started ? (day > c.duration ? "results" : "challenge") : "lobby");
      } else { setScreen("home"); }
    } catch(e) { setScreen("home"); }
    setLoading(false);
  }

  function calcCurrentDay(c: any) {
    if (!c.start_date) return 1;
    const start = new Date(c.start_date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diff, 1), c.duration);
  }

  useEffect(() => {
    if (!challenge || screen !== "lobby") return;
    const sub = supabase.channel("lobby_" + challenge.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participants", filter: `challenge_id=eq.${challenge.id}` },
        (payload: any) => setParticipants(ps => [...ps, payload.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "challenges", filter: `id=eq.${challenge.id}` },
        (payload: any) => { if (payload.new.started) { setChallenge(payload.new); setScreen("challenge"); } })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [challenge, screen]);

  useEffect(() => {
    if (!challenge || screen !== "challenge") return;
    const sub = supabase.channel("challenge_" + challenge.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins", filter: `challenge_id=eq.${challenge.id}` },
        (payload: any) => setCheckins(ci => [...ci, payload.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "participants", filter: `challenge_id=eq.${challenge.id}` },
        (payload: any) => setParticipants(ps => ps.map(p => p.id === payload.new.id ? payload.new : p)))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [challenge, screen]);

  useEffect(() => {
    if (!tlPlaying) return;
    const myCheckins = getMyCheckins();
    const interval = setInterval(() => {
      setTlFrame(f => {
        if (f >= myCheckins.length - 1) { setTlPlaying(false); return f; }
        return f + 1;
      });
    }, 800 / tlSpeed);
    return () => clearInterval(interval);
  }, [tlPlaying, tlSpeed, checkins]);

  function getMyCheckins() {
    if (!participant) return [];
    return checkins.filter((c: any) => c.participant_id === participant.id).sort((a: any, b: any) => a.day - b.day);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setCameraStream(stream);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
      setScreen("camera");
    } catch(e) {
      setError("Camera access denied. Please allow camera in your browser settings.");
    }
  }

  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach((t: any) => t.stop());
    setCameraStream(null);
  }

  function capturePhoto() {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedPhoto(dataUrl);
    stopCamera();
    getGPS();
    setScreen("confirm_checkin");
  }

  function getGPS() {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setGps({ lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4) }); setGpsLoading(false); },
      () => { setGps({ lat: "unavailable", lng: "" }); setGpsLoading(false); },
      { timeout: 10000 }
    );
  }

  async function submitCheckin() {
    setLoading(true); setError(null);
    try {
      const blob = await (await fetch(capturedPhoto!)).blob();
      const path = `${challenge.id}/${participant.id}/day${currentDay}.jpg`;
      const { error: upErr } = await supabase.storage.from("selfies").upload(path, blob, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("selfies").getPublicUrl(path);
      const { error: ciErr } = await supabase.from("checkins").insert({
        challenge_id: challenge.id, participant_id: participant.id, day: currentDay,
        selfie_url: urlData.publicUrl, lat: gps?.lat || null, lng: gps?.lng || null,
      });
      if (ciErr) throw ciErr;
      setCheckins(ci => [...ci, { participant_id: participant.id, day: currentDay, selfie_url: urlData.publicUrl, lat: gps?.lat, lng: gps?.lng }]);
      setCapturedPhoto(null); setGps(null); setScreen("challenge");
    } catch(e: any) { setError("Check-in failed: " + e.message); }
    setLoading(false);
  }

  async function createChallenge() {
    setLoading(true); setError(null);
    try {
      const code = generateCode();
      const { data: c, error: cErr } = await supabase.from("challenges").insert({
        code, name: createForm.name || "Gym Challenge",
        duration: parseInt(String(createForm.duration)),
        wager: parseFloat(String(createForm.wager)),
        host_name: createForm.myName, started: false,
      }).select().single();
      if (cErr) throw cErr;
      const { data: p, error: pErr } = await supabase.from("participants").insert({
        challenge_id: c.id, name: createForm.myName || "You",
        venmo: createForm.venmo, avatar: sampleAvatars[0], eliminated: false,
      }).select().single();
      if (pErr) throw pErr;
      // Save host_id now that we have participant id
      await supabase.from("challenges").update({ host_id: p.id }).eq("id", c.id);
      const updatedChallenge = { ...c, host_id: p.id };
      localStorage.setItem("gymwager_challenge_id", c.id);
      localStorage.setItem("gymwager_participant_id", p.id);
      localStorage.setItem("gymwager_is_host", "true");
      setChallenge(updatedChallenge); setParticipant(p); setParticipants([p]); setCheckins([]);
      setScreen("lobby");
    } catch(e: any) { setError("Failed to create: " + e.message); }
    setLoading(false);
  }

  async function joinChallenge() {
    setLoading(true); setError(null);
    try {
      const { data: c, error: cErr } = await supabase.from("challenges").select().eq("code", joinForm.code.toUpperCase()).single();
      if (cErr || !c) throw new Error("Challenge not found. Check the code and try again.");
      const { data: ps } = await supabase.from("participants").select().eq("challenge_id", c.id);
      const avatar = sampleAvatars[(ps?.length || 0) % sampleAvatars.length];
      const { data: p, error: pErr } = await supabase.from("participants").insert({
        challenge_id: c.id, name: joinForm.myName || "Player",
        venmo: joinForm.venmo, avatar, eliminated: false,
      }).select().single();
      if (pErr) throw pErr;
      const { data: ci } = await supabase.from("checkins").select().eq("challenge_id", c.id);
      const day = calcCurrentDay(c);
      localStorage.setItem("gymwager_challenge_id", c.id);
      localStorage.setItem("gymwager_participant_id", p.id);
      localStorage.setItem("gymwager_is_host", "false");
      setChallenge(c); setParticipant(p); setParticipants([...(ps||[]), p]);
      setCheckins(ci || []); setCurrentDay(day);
      window.history.replaceState({}, "", window.location.pathname);
      setScreen(c.started ? "challenge" : "lobby");
    } catch(e: any) { setError(e.message); }
    setLoading(false);
  }

  async function startChallenge() {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("challenges").update({ started: true, start_date: today }).eq("id", challenge.id);
    if (!error) { setChallenge((c: any) => ({ ...c, started: true, start_date: today })); setCurrentDay(1); setScreen("challenge"); }
    setLoading(false);
  }

  function copyInvite() {
    const url = `${window.location.origin}?code=${challenge.code}`;
    navigator.clipboard.writeText(url).then(() => alert("Invite link copied!"));
  }

  const todayCheckins = checkins.filter((c: any) => c.day === currentDay);
  const iCheckedIn = participant && todayCheckins.some((c: any) => c.participant_id === participant.id);
  const activeParts = participants.filter((p: any) => !p.eliminated);
  const prizePool = participants.length * (challenge?.wager || 0);
  const winShare = activeParts.length > 0 ? Math.floor(prizePool / activeParts.length) : 0;
  const myCheckins = getMyCheckins();
  const isHost = localStorage.getItem("gymwager_is_host") === "true";

  if (screen === "loading") return (
    <div style={{ ...pageStyle, alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:ACCENT, fontSize:32 }}>🏆</div>
      <div style={{ color:"#555", marginTop:8 }}>Loading...</div>
    </div>
  );

  if (screen === "home") return (
    <div style={{ ...pageStyle, alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ fontSize:64, marginBottom:8 }}>🏆</div>
      <h1 style={{ color:"#fff", fontSize:36, fontWeight:900, margin:0, letterSpacing:-1 }}>GymWager</h1>
      <p style={{ color:"#666", marginTop:8, marginBottom:40, textAlign:"center", fontSize:15 }}>Daily check-ins. Real stakes.<br/>Last one standing wins.</p>
      <button onClick={() => setScreen("create")} style={btnStyle(ACCENT,"#000")}>Create Challenge</button>
      <button onClick={() => setScreen("join")} style={{ ...btnStyle("transparent","#fff"), border:"1.5px solid #333", marginTop:12 }}>Join with Code</button>
    </div>
  );

  if (screen === "create") return (
    <div style={pageStyle}>
      <TopBar onBack={() => setScreen("home")} title="New Challenge" />
      <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16, overflowY:"auto" }}>
        {error && <ErrBox msg={error} />}
        <Label>Your Name</Label>
        <Input placeholder="e.g. Alex" value={createForm.myName} onChange={(v: string) => setCreateForm(f=>({...f,myName:v}))} />
        <Label>Challenge Name</Label>
        <Input placeholder="e.g. 30-Day Grind" value={createForm.name} onChange={(v: string) => setCreateForm(f=>({...f,name:v}))} />
        <Label>Duration (days)</Label>
        <SegControl options={[14,21,30,60]} value={createForm.duration} onChange={(v: number) => setCreateForm(f=>({...f,duration:v}))} fmt={(v: number) =>`${v}d`} />
        <Label>Wager per Person ($)</Label>
        <SegControl options={[20,50,100,200]} value={createForm.wager} onChange={(v: number) => setCreateForm(f=>({...f,wager:v}))} fmt={(v: number) =>`$${v}`} />
        <Label>Your Venmo Username</Label>
        <Input placeholder="@yourvenmo" value={createForm.venmo} onChange={(v: string) => setCreateForm(f=>({...f,venmo:v}))} />
        <button onClick={createChallenge} disabled={!createForm.myName||loading} style={btnStyle(ACCENT,"#000",!createForm.myName||loading)}>
          {loading ? "Creating..." : "Create Challenge →"}
        </button>
      </div>
    </div>
  );

  if (screen === "join") return (
    <div style={pageStyle}>
      <TopBar onBack={() => setScreen("home")} title="Join Challenge" />
      <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16 }}>
        {error && <ErrBox msg={error} />}
        <Label>Your Name</Label>
        <Input placeholder="e.g. Alex" value={joinForm.myName} onChange={(v: string) => setJoinForm(f=>({...f,myName:v}))} />
        <Label>Your Venmo Username</Label>
        <Input placeholder="@yourvenmo" value={joinForm.venmo} onChange={(v: string) => setJoinForm(f=>({...f,venmo:v}))} />
        <Label>Challenge Code</Label>
        <Input placeholder="e.g. X7K2P9" value={joinForm.code} onChange={(v: string) => setJoinForm(f=>({...f,code:v.toUpperCase()}))} />
        <button onClick={joinChallenge} disabled={!joinForm.code||!joinForm.myName||loading} style={btnStyle(ACCENT,"#000",!joinForm.code||!joinForm.myName||loading)}>
          {loading ? "Joining..." : "Join Challenge →"}
        </button>
      </div>
    </div>
  );

  function leaveChallenge() {
    if (window.confirm("Leave this challenge and return to home?")) {
      localStorage.removeItem("gymwager_challenge_id");
      localStorage.removeItem("gymwager_participant_id");
      localStorage.removeItem("gymwager_is_host");
      setScreen("home"); setChallenge(null); setParticipant(null); setParticipants([]); setCheckins([]);
    }
  }

  if (screen === "lobby" && challenge) return (
    <div style={pageStyle}>
      <TopBar onBack={leaveChallenge} title="Waiting Room" />
      <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16, overflowY:"auto" }}>
        <div style={{ background:"linear-gradient(135deg,#0d2b1a,#0a1a0a)", border:`1px solid #00ff8733`, borderRadius:16, padding:20, textAlign:"center" }}>
          <div style={{ color:"#666", fontSize:12, textTransform:"uppercase", letterSpacing:1 }}>Invite Code</div>
          <div style={{ color:ACCENT, fontSize:48, fontWeight:900, letterSpacing:8, margin:"8px 0" }}>{challenge.code}</div>
          <button onClick={copyInvite} style={{ ...btnStyle(CARD2,"#aaa"), width:"auto", padding:"8px 20px", fontSize:14, marginTop:4 }}>
            📋 Copy Invite Link
          </button>
        </div>
        <div style={{ background:CARD, borderRadius:16, padding:16, textAlign:"center" }}>
          <div style={{ color:"#666", fontSize:12, textTransform:"uppercase", letterSpacing:1 }}>Current Prize Pool</div>
          <div style={{ color:ACCENT, fontSize:32, fontWeight:900 }}>${prizePool}</div>
          <div style={{ color:"#555", fontSize:12 }}>{participants.length} player{participants.length!==1?"s":""} · ${challenge.wager} each</div>
        </div>
        <div style={{ background:CARD, borderRadius:16, padding:16 }}>
          <div style={{ color:"#888", fontSize:12, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Players Joined</div>
          {participants.map((p: any) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom:"1px solid #1a1a1a" }}>
              <div style={{ fontSize:22 }}>{p.avatar}</div>
              <div style={{ color:"#fff", fontWeight:600 }}>{p.name}{p.id===participant?.id?" (You)":""}</div>
              {p.id===challenge.host_id && <div style={{ marginLeft:"auto", background:"#1a3a1a", color:ACCENT, borderRadius:8, padding:"2px 10px", fontSize:12 }}>Host</div>}
            </div>
          ))}
        </div>
        {isHost ? (
          <button onClick={startChallenge} disabled={participants.length<2||loading} style={btnStyle(ACCENT,"#000",participants.length<2||loading)}>
            {participants.length<2 ? "Waiting for players..." : loading ? "Starting..." : "Start Challenge →"}
          </button>
        ) : (
          <div style={{ color:"#555", textAlign:"center", fontSize:14 }}>Waiting for host to start...</div>
        )}
      </div>
    </div>
  );

  if (screen === "camera") return (
    <div style={{ ...pageStyle, background:"#000" }}>
      <video ref={videoRef} autoPlay playsInline style={{ width:"100%", flex:1, objectFit:"cover" }} />
      <canvas ref={canvasRef} style={{ display:"none" }} />
      <div style={{ padding:24, display:"flex", gap:12 }}>
        <button onClick={() => { stopCamera(); setScreen("challenge"); }} style={{ ...btnStyle("#222","#888"), flex:1 }}>Cancel</button>
        <button onClick={capturePhoto} style={{ ...btnStyle(ACCENT,"#000"), flex:2, fontSize:18 }}>📸 Snap</button>
      </div>
    </div>
  );

  if (screen === "confirm_checkin") return (
    <div style={pageStyle}>
      <TopBar onBack={() => { setCapturedPhoto(null); setScreen("challenge"); }} title="Confirm Check-In" />
      <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16 }}>
        {error && <ErrBox msg={error} />}
        {capturedPhoto && <img src={capturedPhoto} style={{ width:"100%", borderRadius:16, aspectRatio:"1/1", objectFit:"cover" }} />}
        <div style={{ background:CARD, borderRadius:12, padding:14 }}>
          <div style={{ color:"#666", fontSize:13 }}>📍 Location</div>
          <div style={{ color:"#fff", fontSize:14, marginTop:4 }}>
            {gpsLoading ? "Getting GPS..." : gps ? `${gps.lat}, ${gps.lng}` : "GPS unavailable"}
          </div>
        </div>
        <button onClick={submitCheckin} disabled={loading||gpsLoading} style={btnStyle(ACCENT,"#000",loading||gpsLoading)}>
          {loading ? "Submitting..." : "✓ Submit Check-In"}
        </button>
      </div>
    </div>
  );

  if (screen === "challenge" && challenge) return (
    <div style={pageStyle}>
      <div style={{ background:CARD, padding:"16px 24px", borderBottom:"1px solid #222", display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ color:"#666", fontSize:12, textTransform:"uppercase", letterSpacing:1 }}>Active</div>
            <div style={{ color:"#fff", fontSize:20, fontWeight:800 }}>{challenge.name}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"#666", fontSize:12 }}>Day</div>
            <div style={{ color:ACCENT, fontSize:24, fontWeight:900 }}>{currentDay}<span style={{ color:"#555", fontSize:14 }}>/{challenge.duration}</span></div>
          </div>
        </div>
                  <button onClick={leaveChallenge} style={{ background:"none", border:"none", color:"#444", fontSize:12, cursor:"pointer", textAlign:"right", padding:0, alignSelf:"flex-end" }}>✕ Leave Challenge</button>
          <div style={{ background:"#222", borderRadius:4, height:6, marginTop:4 }}>
          <div style={{ background:`linear-gradient(90deg,${ACCENT},${ACCENT2})`, width:`${(currentDay/challenge.duration)*100}%`, height:6, borderRadius:4 }} />
        </div>
      </div>
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:12, overflowY:"auto" }}>
        {error && <ErrBox msg={error} />}
        <div style={{ background:"linear-gradient(135deg,#0d2b1a,#0a1a0a)", border:`1px solid #00ff8733`, borderRadius:16, padding:20, textAlign:"center" }}>
          <div style={{ color:"#666", fontSize:12, textTransform:"uppercase", letterSpacing:1 }}>💰 Prize Pool</div>
          <div style={{ color:ACCENT, fontSize:42, fontWeight:900, lineHeight:1.1 }}>${prizePool}</div>
          <div style={{ color:"#555", fontSize:12, marginTop:4 }}>{activeParts.length} active · ${challenge.wager}/person</div>
        </div>
        <div style={{ background:CARD, borderRadius:16, padding:16 }}>
          <div style={{ color:"#888", fontSize:12, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Today's Check-In — Day {currentDay}</div>
          {iCheckedIn ? (
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {(() => { const ci = checkins.find((c: any) => c.participant_id===participant.id && c.day===currentDay); return ci?.selfie_url ? <img src={ci.selfie_url} style={{ width:60, height:60, borderRadius:12, objectFit:"cover", border:`2px solid ${ACCENT}` }} /> : null; })()}
              <div>
                <div style={{ color:ACCENT, fontWeight:700 }}>✓ Checked In!</div>
                {(() => { const ci = checkins.find((c: any) => c.participant_id===participant.id && c.day===currentDay); return ci ? <div style={{ color:"#666", fontSize:12 }}>📍 {ci.lat}, {ci.lng}</div> : null; })()}
              </div>
            </div>
          ) : (
            <button onClick={startCamera} style={{ ...btnStyle(ACCENT,"#000"), fontSize:16, padding:14 }}>
              📸 Take Selfie & Check In
            </button>
          )}
        </div>
        <div style={{ background:CARD, borderRadius:16, padding:16 }}>
          <div style={{ color:"#888", fontSize:12, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Participants</div>
          {participants.map((p: any) => {
            const checked = todayCheckins.some((c: any) => c.participant_id===p.id);
            return (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom:"1px solid #1a1a1a", opacity:p.eliminated?0.4:1 }}>
                <div style={{ fontSize:22 }}>{p.avatar}</div>
                <div style={{ flex:1 }}>
                  <div style={{ color:p.eliminated?"#555":"#fff", fontWeight:600 }}>{p.name}{p.id===participant?.id?" (You)":""}</div>
                  <div style={{ color:"#555", fontSize:12 }}>{p.eliminated ? `❌ Eliminated Day ${p.eliminated_day}` : checked ? "✓ Checked in" : "⏳ Pending"}</div>
                </div>
                {p.eliminated && p.venmo && (
                  <button onClick={() => setShowPayModal(p)} style={{ background:"#3d1a00", color:"#ff8800", border:"none", borderRadius:8, padding:"4px 10px", fontSize:12, cursor:"pointer" }}>
                    Collect $
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {currentDay >= challenge.duration && (
          <button onClick={() => setScreen("results")} style={btnStyle(ACCENT,"#000")}>🏆 View Results</button>
        )}
      </div>
      {showPayModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:24 }}>
          <div style={{ background:CARD, borderRadius:20, padding:24, width:"100%", maxWidth:360 }}>
            <div style={{ color:"#fff", fontSize:18, fontWeight:800, marginBottom:4 }}>Collect Wager</div>
            <div style={{ color:"#666", fontSize:14, marginBottom:20 }}>{showPayModal.name} was eliminated. Request their ${challenge.wager}.</div>
            <a href={venmoLink(showPayModal.venmo, challenge.wager, `GymWager - ${challenge.name}`)} target="_blank" rel="noreferrer"
              style={{ ...btnStyle("#0070ba","#fff"), display:"block", textAlign:"center", textDecoration:"none", marginBottom:12 }}>
              💙 Request on Venmo
            </a>
            <button onClick={() => setShowPayModal(null)} style={{ ...btnStyle("transparent","#888"), border:"1px solid #333" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );

  if (screen === "results" && challenge) return (
    <div style={pageStyle}>
      <div style={{ background:"linear-gradient(180deg,#0d2b1a,#0a0a0a)", padding:"32px 24px 20px", textAlign:"center" }}>
        <div style={{ fontSize:56 }}>🏆</div>
        <div style={{ color:ACCENT, fontSize:28, fontWeight:900 }}>Challenge Complete!</div>
        <div style={{ color:"#666", fontSize:14, marginTop:4 }}>{challenge.name} · {challenge.duration} Days</div>
        <div style={{ color:"#fff", fontSize:36, fontWeight:900, marginTop:16 }}>${winShare}</div>
        <div style={{ color:"#666", fontSize:13 }}>per winner · {activeParts.length} survivor{activeParts.length!==1?"s":""}</div>
      </div>
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
        <div style={{ background:CARD, borderRadius:16, padding:16 }}>
          <div style={{ color:"#888", fontSize:12, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>🏅 Survivors</div>
          {activeParts.map((p: any) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
              <div style={{ fontSize:24 }}>{p.avatar}</div>
              <div style={{ flex:1, color:"#fff", fontWeight:600 }}>{p.name}{p.id===participant?.id?" (You)":""}</div>
              {p.venmo && <a href={venmoLink(p.venmo, winShare, `GymWager winnings - ${challenge.name}`)} target="_blank" rel="noreferrer"
                style={{ background:"#0070ba", color:"#fff", borderRadius:8, padding:"6px 14px", fontSize:13, fontWeight:700, textDecoration:"none" }}>
                💙 Pay ${winShare}
              </a>}
            </div>
          ))}
        </div>
        <div style={{ background:CARD, borderRadius:16, padding:16 }}>
          <div style={{ color:"#888", fontSize:12, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>🎞 Your Journey</div>
          {myCheckins.length === 0 ? (
            <div style={{ color:"#555", textAlign:"center", padding:20 }}>No selfies recorded</div>
          ) : (
            <>
              <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:8, marginBottom:12 }}>
                {myCheckins.map((c: any, i: number) => (
                  <img key={i} src={c.selfie_url} onClick={() => { setTlFrame(i); setTlPlaying(false); }}
                    style={{ width:48, height:48, borderRadius:8, objectFit:"cover", flexShrink:0, cursor:"pointer", border: i===tlFrame ? `2px solid ${ACCENT}` : "2px solid transparent" }} />
                ))}
              </div>
              <img src={myCheckins[tlFrame]?.selfie_url} style={{ width:"100%", aspectRatio:"1/1", borderRadius:16, objectFit:"cover", marginBottom:12 }} />
              <div style={{ color:"#666", fontSize:12, textAlign:"center", marginBottom:8 }}>Day {myCheckins[tlFrame]?.day} · {tlFrame+1}/{myCheckins.length}</div>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <button onClick={() => setTlFrame(f => Math.max(0,f-1))} style={iconBtn}>⏮</button>
                <button onClick={() => { if(tlPlaying) setTlPlaying(false); else { if(tlFrame===myCheckins.length-1) setTlFrame(0); setTlPlaying(true); } }}
                  style={{ ...iconBtn, background:ACCENT, color:"#000", flex:1, fontWeight:800 }}>
                  {tlPlaying ? "⏸ Pause" : tlFrame===myCheckins.length-1 ? "↺ Replay" : "▶ Play"}
                </button>
                <button onClick={() => setTlFrame(f => Math.min(myCheckins.length-1,f+1))} style={iconBtn}>⏭</button>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <span style={{ color:"#666", fontSize:13, alignSelf:"center" }}>Speed:</span>
                {[0.5,1,2,4].map(s => (
                  <button key={s} onClick={() => setTlSpeed(s)} style={{ flex:1, padding:"6px 0", borderRadius:8, border:"none", cursor:"pointer",
                    background: tlSpeed===s ? ACCENT : CARD2, color: tlSpeed===s ? "#000" : "#888", fontWeight:700, fontSize:13 }}>
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={() => { localStorage.removeItem("gymwager_challenge_id"); localStorage.removeItem("gymwager_participant_id"); setScreen("home"); setChallenge(null); setParticipant(null); }}
          style={btnStyle("#222","#888")}>
          Back to Home
        </button>
      </div>
    </div>
  );

  return null;
}

function TopBar({ onBack, title }: { onBack: (() => void) | null, title: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"16px 20px", borderBottom:"1px solid #1a1a1a", flexShrink:0 }}>
      {onBack && <button onClick={onBack} style={{ background:"none", border:"none", color:"#666", fontSize:20, cursor:"pointer", padding:0 }}>←</button>}
      <div style={{ color:"#fff", fontWeight:700, fontSize:17 }}>{title}</div>
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ color:"#888", fontSize:13, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5, marginBottom:-8 }}>{children}</div>;
}
function Input({ placeholder, value, onChange, type="text" }: { placeholder: string, value: string, onChange: (v: string) => void, type?: string }) {
  return <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
    style={{ background:"#1c1c1c", border:"1px solid #2a2a2a", borderRadius:12, padding:"14px 16px", color:"#fff", fontSize:16, outline:"none", width:"100%", boxSizing:"border-box" }} />;
}
function ErrBox({ msg }: { msg: string }) {
  return <div style={{ background:"#3d0000", border:"1px solid #ff000033", borderRadius:10, padding:"10px 14px", color:"#ff6666", fontSize:14 }}>{msg}</div>;
}
function SegControl({ options, value, onChange, fmt }: { options: number[], value: number, onChange: (v: number) => void, fmt?: (v: number) => string }) {
  return (
    <div style={{ display:"flex", gap:8 }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", cursor:"pointer",
          background: value==o ? ACCENT : CARD2, color: value==o ? "#000" : "#888", fontWeight:700 }}>
          {fmt ? fmt(o) : o}
        </button>
      ))}
    </div>
  );
}
function btnStyle(bg: string, color: string, disabled=false) {
  return { background: disabled?"#1a1a1a":bg, color: disabled?"#444":color, border:"none", borderRadius:14, padding:"15px 24px", fontSize:16, fontWeight:800, cursor: disabled?"default":"pointer", width:"100%", transition:"opacity 0.2s" };
}
const iconBtn = { background:"#222", border:"none", borderRadius:10, padding:"10px 16px", color:"#fff", fontSize:18, cursor:"pointer" };
const pageStyle: React.CSSProperties = { background:"#0a0a0a", minHeight:"100vh", fontFamily:"'Inter',sans-serif", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" };
