import React, { useState, useRef, useEffect } from "react";
import { FileText, Send, Sparkles, Plus, BookOpen, CheckCircle, Image } from "lucide-react";
import ReactMarkdown from "react-markdown";

function App() {
  const [files, setFiles] = useState([]); // Array of strings (filenames)
  const [messages, setMessages] = useState([
    { role: "ai", content: "Hello! Upload a PDF to start chatting with your sources." }
  ]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modes: 'chat', 'briefing', 'quiz', 'image'
  const [mode, setMode] = useState("chat");
  const [briefingContent, setBriefingContent] = useState("");
  const [quizData, setQuizData] = useState([]);
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [imageError, setImageError] = useState("");

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("pdf", selectedFile);

    try {
      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        // Handle backend response which should include allFiles
        if (data.allFiles) {
          setFiles(data.allFiles);
        } else {
          // Fallback if backend isn't updated for some reason
          setFiles(prev => [...prev, data.fileName]);
        }

        setSuggestions(data.suggestions || []);
        setMessages(prev => [
          ...prev,
          { role: "ai", content: `Added **${data.fileName}** to sources. Ask me anything!` }
        ]);

        // Reset briefing/quiz when new content is added
        setBriefingContent("");
        setQuizData([]);
        setMode("chat");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading file");
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async (text = input) => {
    if (!text.trim()) return;
    if (files.length === 0) {
      alert("Please upload at least one PDF first!");
      return;
    }

    const userMsg = text;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await response.json();

      setMessages(prev => [...prev, { role: "ai", content: data.answer }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "ai", content: "**Error:** Could not get response. Backend might be down." }]);
    } finally {
      setLoading(false);
    }
  };

  const loadBriefing = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setMode("briefing");

    if (!briefingContent) {
      try {
        const res = await fetch("http://localhost:5000/briefing", { method: "POST" });
        const data = await res.json();
        setBriefingContent(data.briefing);
      } catch (e) {
        setBriefingContent("Failed to load briefing.");
      }
    }
    setLoading(false);
  };

  const [quizCount, setQuizCount] = useState(10); // Default to 10

  const loadQuiz = async (customCount = quizCount) => {
    if (files.length === 0) return;
    setLoading(true);
    setMode("quiz");

    // Always fetch if loading explicitly or if forced
    try {
      const res = await fetch("http://localhost:5000/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numQuestions: customCount })
      });
      const data = await res.json();
      setQuizData(data.quiz || []);
    } catch (e) {
      alert("Failed to generate quiz.");
    }
    setLoading(false);
  };

  const generateImage = async () => {
    if (!imagePrompt.trim()) return;
    setLoading(true);
    setGeneratedImageUrl("");
    setImageError("");

    try {
      const res = await fetch("http://localhost:5000/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt })
      });
      const data = await res.json();
      if (data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
      } else {
        setImageError(data.error || "Failed to generate image.");
      }
    } catch (e) {
      setImageError("Connection error. Could not reach server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter', sans-serif", backgroundColor: "#f0f2f5" }}>

      {/* Sidebar */}
      <div style={{ width: "260px", backgroundColor: "#ffffff", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "30px" }}>
          <div style={{ width: "32px", height: "32px", background: "linear-gradient(135deg, #FF6B6B, #4ECDC4)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileText size={20} color="white" />
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#333", margin: 0 }}>NotebookCW</h2>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            padding: "12px", borderRadius: "12px",
            backgroundColor: "#f0f4ff", color: "#1a73e8",
            cursor: "pointer", fontWeight: "500", transition: "0.2s"
          }}>
            <Plus size={20} />
            {uploading ? "Uploading..." : "Add Source"}
            <input type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>

        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button onClick={() => setMode("chat")} style={{ background: mode === "chat" ? "#eef3fc" : "transparent", border: "none", textAlign: "left", padding: "10px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", color: mode === "chat" ? "#1a73e8" : "#444" }}>
              <Sparkles size={18} /> Chat
            </button>
            <button onClick={loadBriefing} style={{ background: mode === "briefing" ? "#eef3fc" : "transparent", border: "none", textAlign: "left", padding: "10px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", color: mode === "briefing" ? "#1a73e8" : "#444" }}>
              <BookOpen size={18} /> Briefing Doc
            </button>
            <button onClick={loadQuiz} style={{ background: mode === "quiz" ? "#eef3fc" : "transparent", border: "none", textAlign: "left", padding: "10px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", color: mode === "quiz" ? "#1a73e8" : "#444" }}>
              <CheckCircle size={18} /> QCM Quiz
            </button>
            <button onClick={() => setMode("image")} style={{ background: mode === "image" ? "#eef3fc" : "transparent", border: "none", textAlign: "left", padding: "10px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", color: mode === "image" ? "#1a73e8" : "#444" }}>
              <Image size={18} /> Image Gen
            </button>
          </div>
        )}

        {/* Source List */}
        {files.length > 0 && (
          <div style={{ marginTop: "30px" }}>
            <h3 style={{ fontSize: "12px", fontWeight: "600", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
              Sources ({files.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {files.map((fileName, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", borderRadius: "8px", backgroundColor: "#fcfcfc", border: "1px solid #eee", fontSize: "13px", color: "#555" }}>
                  <FileText size={14} color="#999" />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fileName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: "1000px", margin: "0 auto", width: "100%" }}>

        <div style={{ padding: "20px", borderBottom: "1px solid #eee", backgroundColor: "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "500", color: "#444" }}>
            {files.length > 0 ? "NotebookCW" : "Untitled Notebook"}
            {files.length > 0 && <span style={{ fontSize: "13px", color: "#888", marginLeft: "10px" }}>({files.length} sources active)</span>}
          </h2>
        </div>

        {/* MODE: CHAT */}
        {mode === "chat" && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "40px 20px" }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{
                  display: "flex", gap: "15px", marginBottom: "25px",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
                }}>
                  {msg.role === "ai" && (
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "white", border: "1px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Sparkles size={18} color="#9b72cb" />
                    </div>
                  )}

                  <div style={{
                    maxWidth: "70%", padding: "16px 24px", borderRadius: "18px",
                    backgroundColor: msg.role === "user" ? "#f1f3f4" : "#ffffff",
                    color: "#1f1f1f",
                    boxShadow: msg.role === "ai" ? "0 2px 5px rgba(0,0,0,0.05)" : "none",
                    lineHeight: "1.6"
                  }}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              ))}

              {loading && <div className="typing-dot" style={{ marginLeft: "60px" }}>Thinking...</div>}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions Chips */}
            {suggestions.length > 0 && messages.length < 3 && (
              <div style={{ display: "flex", gap: "10px", padding: "0 20px 10px", justifyContent: "center", flexWrap: "wrap" }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{
                    padding: "8px 16px", borderRadius: "20px", border: "1px solid #d0d7de",
                    backgroundColor: "white", color: "#333", cursor: "pointer", fontSize: "13px"
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: "20px", backgroundColor: "#f0f2f5" }}>
              <div style={{ position: "relative", maxWidth: "800px", margin: "0 auto" }}>
                <input
                  type="text" placeholder="Ask a question about your documents..."
                  value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  style={{
                    width: "100%", padding: "16px 50px 16px 24px",
                    borderRadius: "30px", border: "1px solid #ddd",
                    fontSize: "16px", outline: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
                  }}
                />
                <button onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: input.trim() ? "#1a73e8" : "#ccc", color: "white", border: "none", borderRadius: "50%", width: "40px", height: "40px", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* MODE: BRIEFING */}
        {mode === "briefing" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "40px", backgroundColor: "white", margin: "20px", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
            {loading ? <p>Generating briefing for all documents...</p> : <ReactMarkdown>{briefingContent || "No briefing active."}</ReactMarkdown>}
          </div>
        )}

        {/* MODE: QCM QUIZ */}
        {mode === "quiz" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "40px", margin: "0 auto", width: "100%", maxWidth: "800px" }}>
            {loading ? <p>Generating quiz interactions...</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Quiz Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "15px", backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" }}>
                  <label style={{ fontSize: "14px", fontWeight: "600", color: "#333" }}>Questions:</label>
                  <input
                    type="number"
                    min="1" max="20"
                    value={quizCount}
                    onChange={(e) => setQuizCount(parseInt(e.target.value) || 5)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ddd", width: "60px" }}
                  />
                  <button
                    onClick={() => loadQuiz()}
                    style={{ padding: "8px 16px", backgroundColor: "#1a73e8", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "500" }}
                  >
                    Generate New Quiz
                  </button>
                  {quizData.length > 0 && <span style={{ fontSize: "12px", color: "#888", marginLeft: "auto" }}>Showing {quizData.length} questions</span>}
                </div>

                {quizData.map((q, idx) => (
                  <QuizCard key={idx} question={q} index={idx} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODE: IMAGE GEN */}
        {mode === "image" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "40px", backgroundColor: "white", margin: "20px", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: "20px" }}>
            <h1 style={{ fontSize: "24px", color: "#333", marginBottom: "10px" }}>AI Image Generator</h1>
            <p style={{ color: "#666" }}>Transform your ideas into stunning images using the Subnp API.</p>

            <div style={{ display: "flex", gap: "10px" }}>
              <textarea
                placeholder="Describe the image you want to generate..."
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                style={{
                  flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #ddd",
                  minHeight: "100px", fontFamily: "inherit", outline: "none", fontSize: "15px"
                }}
              />
            </div>

            <button
              onClick={generateImage}
              disabled={loading || !imagePrompt.trim()}
              style={{
                padding: "12px 24px", backgroundColor: loading || !imagePrompt.trim() ? "#ccc" : "#1a73e8",
                color: "white", border: "none", borderRadius: "8px", cursor: loading || !imagePrompt.trim() ? "default" : "pointer",
                fontWeight: "600", alignSelf: "flex-start", transition: "0.2s"
              }}
            >
              {loading ? "Generating..." : "Generate Image"}
            </button>

            {imageError && (
              <div style={{ padding: "15px", backgroundColor: "#fff5f5", color: "#e53e3e", borderRadius: "8px", border: "1px solid #feb2b2" }}>
                <strong>Error:</strong> {imageError}
              </div>
            )}

            {generatedImageUrl && (
              <div style={{ marginTop: "20px", textAlign: "center" }}>
                <h3 style={{ marginBottom: "15px", color: "#444" }}>Result:</h3>
                <img
                  src={generatedImageUrl}
                  alt="Generated AI"
                  style={{ maxWidth: "100%", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.1)", border: "1px solid #eee" }}
                />
                <div style={{ marginTop: "10px" }}>
                  <a href={generatedImageUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a73e8", textDecoration: "none", fontSize: "14px" }}>
                    View full size
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// Simple Sub-Component for Quiz Cards
function QuizCard({ question, index }) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" }}>
      <h3 style={{ margin: "0 0 15px 0", color: "#333" }}>{index + 1}. {question.question}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {question.options.map((opt, i) => (
          <div key={i} style={{ padding: "10px", backgroundColor: "#f9f9f9", borderRadius: "6px", border: "1px solid #eee", cursor: "default" }}>
            {opt}
          </div>
        ))}
      </div>
      <div style={{ marginTop: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setShowAnswer(!showAnswer)} style={{ background: "none", border: "none", color: "#1a73e8", fontWeight: "600", cursor: "pointer" }}>
          {showAnswer ? "Hide Answer" : "Show Answer"}
        </button>
        {showAnswer && <span style={{ color: "#2f855a", fontWeight: "bold" }}>Answer: {question.answer}</span>}
      </div>
    </div>
  );
}

export default App;
