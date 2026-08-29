"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

type Stage = "cast" | "idea" | "scenes" | "images" | "motion" | "edit";
type MotionStatus = "idle" | "queued" | "in_progress" | "failed";
type Scene = { id: number; title: string; beat: string; duration: number; shot: string; imagePrompt: string; motionPrompt: string; imageReady: boolean; motionReady: boolean; imageUrl?: string; motionVideoUrl?: string; motionStatus?: MotionStatus; motionError?: string };
type Character = { id: string; name: string; description: string; referenceImageUrl?: string };
type ApiProvider = "openai" | "higgsfield";
type SpeechResult = { 0: { transcript: string }; isFinal: boolean; length: number };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const initialIdea = "On the final night before an old lighthouse goes dark, its keeper discovers that the beam is guiding a tiny paper boat through a storm. She races to repair the failing lantern, signals the boat toward a hidden cove, and watches the sunrise reveal a new keeper arriving to carry the light forward.";

const starterScenes: Scene[] = [
  { id: 1, title: "The final watch", beat: "The keeper climbs the lighthouse stairs as a storm gathers beyond the glass.", duration: 5, shot: "Slow dolly in · wide", imagePrompt: "Cinematic lighthouse interior at night, a seasoned Black woman climbing a spiral staircase toward a warm lantern room, indigo storm clouds beyond tall windows, brass machinery, poetic hand-painted 3D realism, soft film grain, wide composition, 16:9", motionPrompt: "Slow dolly upward behind the keeper. Her coat shifts in the draft, rain moves across the windows, and the lantern flickers above. Preserve facial identity and the calm, deliberate pacing.", imageReady: true, motionReady: true },
  { id: 2, title: "A signal in the storm", beat: "A tiny paper boat appears between the waves, answering each sweep of the beam.", duration: 6, shot: "Gentle orbit · medium wide", imagePrompt: "A tiny glowing paper boat navigating dark ocean waves beneath a lighthouse beam, rain and sea spray, midnight blue and amber palette, restrained magical realism, tender cinematic storybook frame, 16:9", motionPrompt: "Gently orbit the paper boat as it rises and falls on the waves. The lighthouse beam sweeps across the water and the folded sail trembles in the wind. Keep the motion readable and low stimulation.", imageReady: true, motionReady: false },
  { id: 3, title: "Keep the light alive", beat: "The lantern fails, and the keeper repairs its worn gears before the boat reaches the rocks.", duration: 5, shot: "Push in · close-up", imagePrompt: "Close cinematic portrait of a lighthouse keeper repairing intricate brass lantern gears by hand, quiet focus in her eyes, indigo shadows, amber rim light, rain streaking the windows behind her, tactile detail, restrained emotion, 16:9", motionPrompt: "Very slow push toward the keeper as she reconnects the final gear. The mechanism catches, warm light builds across her face, and she takes one steady breath. Maintain anatomy and exact facial features.", imageReady: false, motionReady: false },
  { id: 4, title: "The light continues", beat: "At sunrise, the boat reaches a hidden cove as a new keeper arrives to take the next watch.", duration: 7, shot: "Crane out · hero wide", imagePrompt: "Lighthouse above a sheltered cove at luminous dawn, tiny paper boat safe near shore, two generations of lighthouse keepers meeting beside the glowing tower, celestial gold and dusty lavender, hopeful cinematic hero composition, 16:9", motionPrompt: "Crane back and upward as the storm clears. The paper boat glides into the cove, the two keepers greet each other, and the lighthouse fades into sunrise. Elegant continuous motion with a hopeful finish.", imageReady: false, motionReady: false },
];

const nav: Array<{ id: Stage; label: string; eyebrow: string }> = [
  { id: "cast", label: "Cast", eyebrow: "✦" }, { id: "idea", label: "Story spark", eyebrow: "01" }, { id: "scenes", label: "Scene map", eyebrow: "02" }, { id: "images", label: "Frames", eyebrow: "03" }, { id: "motion", label: "Motion", eyebrow: "04" }, { id: "edit", label: "Edit room", eyebrow: "05" },
];
const sceneLooks = ["look-one", "look-two", "look-three", "look-four", "look-five"];

function buildScenes(idea: string): Scene[] {
  const chunks = idea.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 6);
  const usable = chunks.length > 1 ? chunks : [idea, "The emotional truth becomes visible.", "The final image resolves the journey."];
  const titles = ["The opening image", "A door opens", "The inner turn", "What changes", "The final image", "Afterglow"];
  const shots = ["Slow dolly in · wide", "Lateral glide · medium", "Push in · close-up", "Gentle orbit · medium", "Crane out · hero wide", "Locked frame · wide"];
  return usable.map((beat, index) => ({ id: index + 1, title: titles[index] ?? `Scene ${index + 1}`, beat, duration: index === usable.length - 1 ? 7 : 5, shot: shots[index] ?? "Slow push · medium", imagePrompt: `Cinematic story frame: ${beat} Black lead character, emotionally precise visual storytelling, midnight indigo and celestial gold palette, soft volumetric light, rich texture, restrained magical realism, consistent character design, 16:9`, motionPrompt: `Translate the still into a calm cinematic shot. ${shots[index] ?? "Slow push forward"}. Preserve the character's face, wardrobe, lighting, and composition. Add only motivated environmental motion and one clear emotional action.`, imageReady: false, motionReady: false }));
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("scenes");
  const [idea, setIdea] = useState(initialIdea);
  const [projectName, setProjectName] = useState("The Last Light");
  const [scenes, setScenes] = useState<Scene[]>(starterScenes);
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [apiKeys, setApiKeys] = useState<Record<ApiProvider, string>>({ openai: "", higgsfield: "" });
  const [connectedProviders, setConnectedProviders] = useState<Record<ApiProvider, boolean>>({ openai: false, higgsfield: false });
  const [visibleKey, setVisibleKey] = useState<ApiProvider | null>(null);
  const [generatingSceneId, setGeneratingSceneId] = useState<number | null>(null);
  const [animatingSceneId, setAnimatingSceneId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [leadCharacterIds, setLeadCharacterIds] = useState<string[]>([]);
  const [charFormId, setCharFormId] = useState<string | null>(null);
  const [charFormName, setCharFormName] = useState("");
  const [charFormDescription, setCharFormDescription] = useState("");
  const [charFormReferenceUrl, setCharFormReferenceUrl] = useState("");
  const [isSavingCharacter, setIsSavingCharacter] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isGeneratingReference, setIsGeneratingReference] = useState(false);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationBaseRef = useRef("");
  const saveTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/characters");
        const result = await response.json() as { characters?: Character[] };
        if (response.ok && result.characters) setCharacters(result.characters);
      } catch { /* cast library stays empty */ }
      const savedId = window.localStorage.getItem("museflow-project-id");
      if (savedId) {
        try {
          const response = await fetch(`/api/project?id=${encodeURIComponent(savedId)}`);
          const result = await response.json() as { project?: { id: string; name: string; idea: string; leadCharacterIds: string[] } | null; scenes?: Scene[] };
          if (response.ok && result.project) {
            setProjectId(result.project.id);
            setIdea(result.project.idea || initialIdea);
            setProjectName(result.project.name || "Untitled film");
            setLeadCharacterIds(result.project.leadCharacterIds ?? []);
            if (result.scenes?.length) setScenes(result.scenes);
          } else {
            window.localStorage.removeItem("museflow-project-id");
          }
        } catch { /* keep starter, will save as a new project */ }
      }
      const SpeechRecognitionApi = (window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
        ?? (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
      setSpeechSupported(Boolean(SpeechRecognitionApi));
      setConnectedProviders({
        openai: Boolean(window.sessionStorage.getItem("museflow-openai-key")),
        higgsfield: Boolean(window.sessionStorage.getItem("museflow-higgsfield-key")),
      });
      setHydrated(true);
    })();
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch("/api/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projectId ?? undefined, name: projectName, idea, scenes, leadCharacterIds }) });
        const result = await response.json() as { id?: string; error?: string };
        if (!response.ok || !result.id) throw new Error(result.error ?? "Save failed.");
        if (result.id !== projectId) {
          setProjectId(result.id);
          window.localStorage.setItem("museflow-project-id", result.id);
        }
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 1200);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [hydrated, idea, projectName, scenes, projectId, leadCharacterIds]);

  const totalSeconds = useMemo(() => scenes.reduce((sum, scene) => sum + scene.duration, 0), [scenes]);
  const readyImages = scenes.filter((scene) => scene.imageReady).length;
  const readyMotion = scenes.filter((scene) => scene.motionReady).length;
  const activeScene = scenes[selected] ?? scenes[0];
  const activeCharacters = useMemo(() => characters.filter((character) => leadCharacterIds.includes(character.id)), [characters, leadCharacterIds]);
  const primaryReferenceUrl = activeCharacters.find((character) => character.referenceImageUrl)?.referenceImageUrl;
  function flash(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2300); }
  function toggleLeadCharacter(id: string) { setLeadCharacterIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]); }
  function resetCharacterForm() { setCharFormId(null); setCharFormName(""); setCharFormDescription(""); setCharFormReferenceUrl(""); }
  function loadCharacterIntoForm(character: Character) { setCharFormId(character.id); setCharFormName(character.name); setCharFormDescription(character.description); setCharFormReferenceUrl(character.referenceImageUrl ?? ""); }
  async function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploadingReference(true);
    try {
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read this file."));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/characters/reference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileDataUrl }) });
      const result = await response.json() as { referenceImageUrl?: string; error?: string };
      if (!response.ok || !result.referenceImageUrl) throw new Error(result.error ?? "Upload failed.");
      setCharFormReferenceUrl(result.referenceImageUrl);
      flash("Reference photo uploaded.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploadingReference(false);
    }
  }
  async function generateCharacterReference() {
    const apiKey = window.sessionStorage.getItem("museflow-openai-key");
    if (!apiKey) {
      setShowConnections(true);
      flash("Connect your OpenAI API key to generate a reference.");
      return;
    }
    if (!charFormDescription.trim()) return flash("Describe this character first.");
    setIsGeneratingReference(true);
    try {
      const response = await fetch("/api/generate-character", { method: "POST", headers: { "Content-Type": "application/json", "x-provider-key": apiKey }, body: JSON.stringify({ name: charFormName || "Character", description: charFormDescription }) });
      const result = await response.json() as { referenceImageUrl?: string; error?: string };
      if (!response.ok || !result.referenceImageUrl) throw new Error(result.error ?? "Reference generation failed.");
      setCharFormReferenceUrl(result.referenceImageUrl);
      flash("Reference generated.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Reference generation failed.");
    } finally {
      setIsGeneratingReference(false);
    }
  }
  async function saveCharacter() {
    if (!charFormName.trim()) return flash("Give this character a name first.");
    setIsSavingCharacter(true);
    try {
      const response = await fetch("/api/characters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: charFormId ?? undefined, name: charFormName, description: charFormDescription, referenceImageUrl: charFormReferenceUrl || undefined }) });
      const result = await response.json() as Character & { error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Save failed.");
      setCharacters((current) => charFormId ? current.map((character) => character.id === result.id ? result : character) : [...current, result]);
      flash(`${result.name} saved to your cast.`);
      resetCharacterForm();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSavingCharacter(false);
    }
  }
  async function createStoryMap() {
    if (!idea.trim()) return flash("Add your story idea first.");
    setIsBuilding(true);
    const apiKey = window.sessionStorage.getItem("museflow-openai-key");
    try {
      if (!apiKey) throw new Error("no-key");
      const response = await fetch("/api/generate-scenes", { method: "POST", headers: { "Content-Type": "application/json", "x-provider-key": apiKey }, body: JSON.stringify({ idea, characters: activeCharacters.map((character) => ({ name: character.name, description: character.description })) }) });
      const result = await response.json() as { scenes?: Array<Omit<Scene, "id" | "imageReady" | "motionReady">>; error?: string };
      if (!response.ok || !result.scenes?.length) throw new Error(result.error ?? "generation-failed");
      const next: Scene[] = result.scenes.map((scene, index) => ({ ...scene, id: index + 1, imageReady: false, motionReady: false }));
      setScenes(next);
      setSelected(0);
      setStage("scenes");
      flash(`${next.length} scenes mapped by ChatGPT.`);
    } catch (error) {
      const next = buildScenes(idea);
      setScenes(next);
      setSelected(0);
      setStage("scenes");
      flash(error instanceof Error && error.message !== "no-key" && error.message !== "generation-failed" ? error.message : apiKey ? "ChatGPT scene mapping failed, used the offline splitter instead." : "Connect your OpenAI key for AI scene mapping — used the offline splitter for now.");
    } finally {
      setIsBuilding(false);
    }
  }
  function updateScene(id: number, updates: Partial<Scene>) { setScenes((current) => current.map((scene) => scene.id === id ? { ...scene, ...updates } : scene)); }
  async function copy(text: string, label: string) { await navigator.clipboard?.writeText(text); flash(`${label} copied.`); }
  async function generateFrame(id: number) {
    const apiKey = window.sessionStorage.getItem("museflow-openai-key");
    if (!apiKey) {
      setShowConnections(true);
      flash("Connect your OpenAI API key to generate a frame.");
      return;
    }
    const scene = scenes.find((item) => item.id === id);
    if (!scene) return;
    setGeneratingSceneId(id);
    flash("ChatGPT Images is creating your frame…");
    try {
      const response = await fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json", "x-provider-key": apiKey }, body: JSON.stringify({ prompt: scene.imagePrompt, characterReferenceUrl: primaryReferenceUrl }) });
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) throw new Error(result.error ?? "Image generation failed.");
      updateScene(id, { imageReady: true, imageUrl: result.imageUrl });
      flash("Frame ready for review.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Image generation failed. Check your API key.");
    } finally {
      setGeneratingSceneId(null);
    }
  }
  async function pollMotionStatus(sceneId: number, statusUrl: string, apiKey: string, delayMs = 2000): Promise<void> {
    const response = await fetch(`/api/motion-status?statusUrl=${encodeURIComponent(statusUrl)}`, { headers: { "x-provider-key": apiKey } });
    const result = await response.json() as { status?: string; videoUrl?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Higgsfield lost track of this clip.");
    if (result.status === "completed" && result.videoUrl) {
      updateScene(sceneId, { motionReady: true, motionVideoUrl: result.videoUrl, motionStatus: undefined, motionError: undefined });
      return;
    }
    if (result.status === "failed" || result.status === "nsfw" || result.status === "canceled") {
      throw new Error(result.error ?? `Higgsfield could not finish this clip (${result.status}).`);
    }
    updateScene(sceneId, { motionStatus: result.status === "in_progress" ? "in_progress" : "queued" });
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    await pollMotionStatus(sceneId, statusUrl, apiKey, Math.min(delayMs * 1.5, 10000));
  }
  async function generateMotion(id: number) {
    const apiKey = window.sessionStorage.getItem("museflow-higgsfield-key");
    if (!apiKey) {
      setShowConnections(true);
      flash("Connect your Higgsfield key to animate a frame.");
      return;
    }
    const scene = scenes.find((item) => item.id === id);
    if (!scene?.imageReady || !scene.imageUrl) return flash("Generate the frame before animating it.");
    setAnimatingSceneId(id);
    updateScene(id, { motionStatus: "queued", motionError: undefined });
    flash("Higgsfield is animating your frame…");
    try {
      const response = await fetch("/api/generate-motion", { method: "POST", headers: { "Content-Type": "application/json", "x-provider-key": apiKey }, body: JSON.stringify({ imageUrl: scene.imageUrl, prompt: scene.motionPrompt }) });
      const result = await response.json() as { requestId?: string; statusUrl?: string; error?: string };
      if (!response.ok || !result.statusUrl) throw new Error(result.error ?? "Motion generation failed.");
      await pollMotionStatus(id, result.statusUrl, apiKey);
      flash("Motion clip ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Motion generation failed. Check your Higgsfield key.";
      updateScene(id, { motionStatus: "failed", motionError: message });
      flash(message);
    } finally {
      setAnimatingSceneId(null);
    }
  }
  function exportPlan() { const file = new Blob([JSON.stringify({ projectName, idea, aspectRatio: "16:9", scenes }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "museflow-project"}-edit-plan.json`; link.click(); URL.revokeObjectURL(url); flash("Edit plan exported."); }

  function toggleDictation() {
    if (isListening) {
      speechRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognitionApi = (window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (!SpeechRecognitionApi) {
      setSpeechSupported(false);
      flash("Voice dictation is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognitionApi();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    dictationBaseRef.current = idea.trim();
    recognition.onresult = (event) => {
      let spoken = "";
      for (let index = 0; index < event.results.length; index += 1) spoken += event.results[index][0].transcript;
      const joiner = dictationBaseRef.current ? " " : "";
      setIdea(`${dictationBaseRef.current}${joiner}${spoken}`.trim());
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => { setIsListening(false); flash("I couldn’t hear that. Try the microphone again."); };
    speechRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function saveApiKey(provider: ApiProvider) {
    const value = apiKeys[provider].trim();
    if (value.length < 12) {
      flash("Paste the complete API key first.");
      return;
    }
    window.sessionStorage.setItem(`museflow-${provider}-key`, value);
    setConnectedProviders((current) => ({ ...current, [provider]: true }));
    setApiKeys((current) => ({ ...current, [provider]: "" }));
    flash(`${provider === "openai" ? "ChatGPT Images" : "Higgsfield"} connected for this session.`);
  }

  function disconnectApi(provider: ApiProvider) {
    window.sessionStorage.removeItem(`museflow-${provider}-key`);
    setConnectedProviders((current) => ({ ...current, [provider]: false }));
    flash(`${provider === "openai" ? "ChatGPT Images" : "Higgsfield"} disconnected.`);
  }

  return <main className="studio-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setStage("idea")} aria-label="MuseFlow home"><span className="brand-mark"><i /><i /><i /></span><span><b>MuseFlow</b><small>STORY STUDIO</small></span></button>
      <div className="project-heading"><span className="status-dot" /><input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project title" /><span className="saved-label">{saveState === "saving" ? "Saving…" : "Saved to your workspace"}</span></div>
      <div className="top-actions"><button className="icon-button" onClick={() => setShowConnections(true)} aria-label="Open connections">⌁</button><button className="outline-button" onClick={exportPlan}>Export plan <span>↗</span></button></div>
    </header>

    <div className="workspace"><aside className="rail" aria-label="Creation pipeline"><div className="rail-label">PIPELINE</div><nav>{nav.map((item, index) => { const activeIndex = nav.findIndex((entry) => entry.id === stage); return <button key={item.id} className={`${stage === item.id ? "active" : ""} ${index < activeIndex ? "complete" : ""}`} onClick={() => setStage(item.id)}><span>{index < activeIndex ? "✓" : item.eyebrow}</span><b>{item.label}</b></button>; })}</nav><div className="rail-footer"><div className="avatar">MF</div><div><b>Demo studio</b><small>Local workspace</small></div></div></aside>

      <section className="stage-area">
        {stage === "cast" && <div className="cast-view view-enter">
          <div className="section-kicker"><span>✦</span> YOUR CAST</div>
          <h1>Bring your characters, once.</h1>
          <p className="lede">Build a character here and reuse them in any MuseFlow project. Check a character to attach them to this project — every scene, frame, and motion clip generated while they&rsquo;re checked stays locked to their look.</p>
          <div className="cast-layout">
            <div className="cast-grid">
              {characters.length === 0 && <p className="cast-empty">No characters yet — create one to the right.</p>}
              {characters.map((character) => <article key={character.id} className={`cast-card ${leadCharacterIds.includes(character.id) ? "selected" : ""}`}>
                <div className="cast-thumb" style={character.referenceImageUrl ? { backgroundImage: `url(${character.referenceImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!character.referenceImageUrl && <span>✦</span>}</div>
                <div className="cast-copy"><b>{character.name}</b><p>{character.description}</p></div>
                <div className="cast-actions">
                  <label className="cast-toggle"><input type="checkbox" checked={leadCharacterIds.includes(character.id)} onChange={() => toggleLeadCharacter(character.id)} /> Use in this project</label>
                  <button onClick={() => loadCharacterIntoForm(character)}>Edit</button>
                </div>
              </article>)}
            </div>
            <aside className="cast-form">
              <span>{charFormId ? "EDIT CHARACTER" : "NEW CHARACTER"}</span>
              <label>Name<input value={charFormName} onChange={(event) => setCharFormName(event.target.value)} placeholder="Aria Nightshade" /></label>
              <label>Description<textarea value={charFormDescription} onChange={(event) => setCharFormDescription(event.target.value)} placeholder="A weathered lighthouse keeper, deep brown skin, silver locs pulled back, long indigo coat with brass buttons." /></label>
              <div className="cast-reference">{charFormReferenceUrl ? <img src={charFormReferenceUrl} alt="Character reference" /> : <div className="cast-reference-empty">No reference yet</div>}</div>
              <div className="cast-reference-actions">
                <label className="upload-button">{isUploadingReference ? "Uploading…" : "Upload photo"}<input type="file" accept="image/*" hidden onChange={handleReferenceUpload} disabled={isUploadingReference} /></label>
                <button onClick={generateCharacterReference} disabled={isGeneratingReference || !charFormDescription.trim()}>{isGeneratingReference ? "Generating…" : "Generate reference"}</button>
              </div>
              <div className="cast-form-actions">
                {charFormId && <button onClick={resetCharacterForm}>Cancel</button>}
                <button className="primary-button" onClick={saveCharacter} disabled={isSavingCharacter || !charFormName.trim()}>{isSavingCharacter ? "Saving…" : charFormId ? "Update character" : "Save character"}</button>
              </div>
            </aside>
          </div>
        </div>}

        {stage === "idea" && <div className="idea-view view-enter"><div className="section-kicker"><span>01</span> START WITH THE FEELING</div><h1>Tell me the movie in your head.</h1><p className="lede">Messy is welcome. Type it, speak it, or paste the poem that started it. MuseFlow will find the beats without flattening your voice.</p><div className={`idea-card ${isListening ? "listening" : ""}`}><div className="idea-toolbar"><span>STORY BRAIN DUMP</span><div className="idea-tools"><span>{idea.length} characters</span><button className={`dictate-button ${isListening ? "active" : ""}`} onClick={toggleDictation} disabled={!speechSupported} aria-pressed={isListening} aria-label={isListening ? "Stop dictating story" : "Dictate story spark"}><i>{isListening ? "■" : "●"}</i>{isListening ? "Listening — tap to stop" : speechSupported ? "Dictate story" : "Dictation unavailable"}</button></div></div><textarea value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="I keep imagining…" aria-label="Story spark" /><div className="dictation-status" aria-live="polite">{isListening ? <><span /> Listening… speak naturally. Your words will appear here.</> : "Use the microphone when the idea is easier to say than type."}</div><div className="idea-footer"><div className="tone-pills"><button className="selected">Poetic</button><button>Cinematic</button><button>Low-stimulation</button></div><button className="primary-button" onClick={createStoryMap} disabled={isBuilding}>{isBuilding ? "Finding the story beats…" : "Build my scene map"}<span>→</span></button></div></div><div className="promise-row"><span>✦ Your voice stays central</span><span>◌ Character continuity baked in</span><span>⌁ Edit every decision</span></div></div>}

        {stage === "scenes" && <div className="scene-view view-enter"><div className="stage-header"><div><div className="section-kicker"><span>02</span> STORY MAP</div><h1>Your idea, shaped into scenes.</h1><p>Each scene carries one emotional beat and one visual job. Click any card to refine it.</p></div><div className="runtime"><small>EST. RUNTIME</small><strong>00:{String(totalSeconds).padStart(2, "0")}</strong><span>{scenes.length} scenes · 16:9</span></div></div><div className="scene-layout"><div className="scene-list">{scenes.map((scene, index) => <button key={scene.id} className={`scene-card ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)}><span className="grip">⠿</span><span className={`scene-thumb ${sceneLooks[index % sceneLooks.length]}`}><i>{String(index + 1).padStart(2, "0")}</i></span><span className="scene-copy"><small>SCENE {String(index + 1).padStart(2, "0")}</small><b>{scene.title}</b><em>{scene.beat}</em></span><span className="scene-meta"><b>{scene.duration}s</b><small>{scene.shot.split(" · ")[0]}</small></span></button>)}<button className="add-scene" onClick={() => { const id = Math.max(0, ...scenes.map((scene) => scene.id)) + 1; setScenes([...scenes, { id, title: "New story beat", beat: "Describe what changes in this moment.", duration: 5, shot: "Slow push · medium", imagePrompt: "Cinematic story frame, Black lead character, emotionally precise, 16:9", motionPrompt: "Slow, motivated camera movement. Preserve identity and composition.", imageReady: false, motionReady: false }]); setSelected(scenes.length); }}><span>＋</span> Add a scene</button></div>{activeScene && <aside className="scene-inspector"><div className="inspector-top"><span>SCENE {String(selected + 1).padStart(2, "0")}</span><button onClick={() => setStage("images")}>Open in Frames ↗</button></div><label>Scene title<input value={activeScene.title} onChange={(event) => updateScene(activeScene.id, { title: event.target.value })} /></label><label>Story beat<textarea value={activeScene.beat} onChange={(event) => updateScene(activeScene.id, { beat: event.target.value })} /></label><div className="two-fields"><label>Duration<input type="number" min="1" max="30" value={activeScene.duration} onChange={(event) => updateScene(activeScene.id, { duration: Number(event.target.value) })} /></label><label>Shot<input value={activeScene.shot} onChange={(event) => updateScene(activeScene.id, { shot: event.target.value })} /></label></div><div className="prompt-preview"><span>VISUAL DIRECTION</span><p>{activeScene.imagePrompt}</p><button onClick={() => copy(activeScene.imagePrompt, "Image prompt")}>Copy prompt</button></div></aside>}</div><div className="continue-bar"><span><b>Story spine:</b> Recognition → tenderness → integration</span><button className="primary-button" onClick={() => setStage("images")}>Create the frames <span>→</span></button></div></div>}

        {stage === "images" && <div className="asset-view view-enter"><div className="stage-header compact"><div><div className="section-kicker"><span>03</span> KEY FRAMES</div><h1>Give every scene its world.</h1><p>Prompts share the same character and visual DNA so the film feels like one memory, not four different generations.</p></div><div className={`connection-chip ${connectedProviders.openai ? "connected" : ""}`}><span className="openai-mark">✺</span><div><b>ChatGPT Images</b><small>{connectedProviders.openai ? "Your key is connected" : "Bring your own API key"}</small></div><button onClick={() => setShowConnections(true)}>Manage</button></div></div><div className="asset-grid">{scenes.map((scene, index) => <article className="asset-card" key={scene.id}><div className={`asset-preview ${sceneLooks[index % sceneLooks.length]} ${scene.imageReady ? "ready" : ""}`} style={scene.imageUrl ? { backgroundImage: `url(${scene.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span>SCENE {String(index + 1).padStart(2, "0")}</span>{scene.imageReady ? scene.imageUrl ? null : <div className="frame-art"><i /><i /><i /></div> : <div className="empty-frame">✦<small>Frame not generated</small></div>}<button onClick={() => setSelected(index)}>•••</button></div><div className="asset-info"><b>{scene.title}</b><p>{scene.imagePrompt}</p><div><button onClick={() => copy(scene.imagePrompt, "Image prompt")}>Copy</button><button className="generate" disabled={generatingSceneId === scene.id} onClick={() => generateFrame(scene.id)}>{generatingSceneId === scene.id ? "Generating…" : scene.imageReady ? "Regenerate" : "Generate frame"} <span>✺</span></button></div></div></article>)}</div><div className="continue-bar"><span><b>{readyImages}/{scenes.length}</b> frames ready</span><button className="primary-button" onClick={() => setStage("motion")}>Plan the motion <span>→</span></button></div></div>}

        {stage === "motion" && <div className="motion-view view-enter"><div className="stage-header compact"><div><div className="section-kicker"><span>04</span> MOTION DIRECTION</div><h1>Motion with a reason.</h1><p>MuseFlow sends each frame and its motion direction to Higgsfield, which renders a real video clip.</p></div><div className={`connection-chip higgs ${connectedProviders.higgsfield ? "connected" : ""}`}><span>H</span><div><b>Higgsfield</b><small>{connectedProviders.higgsfield ? "Your key is connected" : "Bring your own API key"}</small></div><button onClick={() => setShowConnections(true)}>Manage</button></div></div><div className="motion-list">{scenes.map((scene, index) => <article key={scene.id} className="motion-row"><div className={`motion-still ${sceneLooks[index % sceneLooks.length]}`} style={!scene.motionVideoUrl && scene.imageUrl ? { backgroundImage: `url(${scene.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{scene.motionVideoUrl ? <video src={scene.motionVideoUrl} muted loop autoPlay playsInline /> : <><span>{String(index + 1).padStart(2, "0")}</span>{scene.imageReady ? scene.imageUrl ? null : <div className="mini-subject" /> : <small>NO FRAME</small>}</>}</div><div className="motion-copy"><small>{scene.shot.toUpperCase()}</small><b>{scene.title}</b><p>{scene.motionPrompt}</p><div className="motion-tags"><span>Identity lock</span><span>Calm pacing</span><span>{scene.duration}s</span></div>{scene.motionStatus === "failed" && scene.motionError && <p className="motion-error">{scene.motionError}</p>}</div><div className="motion-actions"><button onClick={() => copy(scene.motionPrompt, "Motion prompt")}>Copy prompt</button><button className={scene.motionReady ? "prepared" : ""} disabled={animatingSceneId === scene.id || !scene.imageReady} onClick={() => generateMotion(scene.id)}>{animatingSceneId === scene.id ? (scene.motionStatus === "in_progress" ? "Rendering…" : "Queued…") : scene.motionReady ? "Regenerate clip" : scene.motionStatus === "failed" ? "Retry animation" : "Animate with Higgsfield"}</button></div></article>)}</div><div className="continue-bar"><span><b>{readyMotion}/{scenes.length}</b> motion clips ready</span><button className="primary-button" onClick={() => setStage("edit")}>Enter the edit room <span>→</span></button></div></div>}

        {stage === "edit" && <div className="edit-view view-enter"><div className="edit-heading"><div><div className="section-kicker"><span>05</span> ROUGH CUT</div><h1>Feel the whole story.</h1></div><div className="edit-actions"><button>Captions</button><button>Music</button><button className="primary-button" onClick={exportPlan}>Export for CapCut <span>↗</span></button></div></div><div className="editor-grid"><div className={`viewer ${sceneLooks[selected % sceneLooks.length]}`} style={!activeScene?.motionVideoUrl && activeScene?.imageUrl ? { backgroundImage: `url(${activeScene.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><div className="safe-frame">{activeScene?.motionVideoUrl ? <video key={activeScene.id} src={activeScene.motionVideoUrl} muted loop autoPlay playsInline className="viewer-video" /> : !activeScene?.imageUrl && <div className="viewer-art"><i /><i /><i /></div>}<div className="caption-preview">{activeScene?.beat}</div></div><div className="viewer-controls"><button onClick={() => setSelected(Math.max(0, selected - 1))}>◁</button><button className="play" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? "Ⅱ" : "▶"}</button><button onClick={() => setSelected(Math.min(scenes.length - 1, selected + 1))}>▷</button><span>00:{String(scenes.slice(0, selected).reduce((sum, scene) => sum + scene.duration, 0)).padStart(2, "0")} / 00:{String(totalSeconds).padStart(2, "0")}</span><button>▣</button></div></div><aside className="cut-notes"><span>CUT NOTES</span><h3>{activeScene?.title}</h3><p>Let this beat breathe. Cut on the emotional action, not just the camera movement.</p><label>Transition<select defaultValue="Dissolve"><option>Dissolve</option><option>Hard cut</option><option>Fade through black</option></select></label><label>Voiceover<textarea placeholder="Add the line that belongs over this scene…" /></label><button onClick={() => flash("Cut note saved.")}>Save note</button></aside></div><div className="timeline"><div className="timeline-ruler"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span><span>00:{String(totalSeconds).padStart(2, "0")}</span></div><div className="track"><b>VIDEO</b><div className="clips">{scenes.map((scene, index) => <button key={scene.id} style={{ flex: scene.duration }} className={`${sceneLooks[index % sceneLooks.length]} ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)}><span>{index + 1}</span>{scene.title}</button>)}</div></div><div className="track audio"><b>VOICE</b><div className="waveform">{Array.from({ length: 44 }).map((_, index) => <i key={index} style={{ height: `${7 + ((index * 13) % 21)}px` }} />)}</div></div><div className="track music"><b>MUSIC</b><div><span>Dreaming of Stars — instrumental</span><em>♪</em></div></div></div></div>}
      </section></div>

    {showConnections && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowConnections(false)}><section className="connection-modal" role="dialog" aria-modal="true" aria-label="Creative tool connections" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowConnections(false)}>×</button><div className="section-kicker"><span>⌁</span> BRING YOUR OWN KEYS</div><h2>Use your creative accounts.</h2><p>Each person can connect their own provider credentials. Keys are kept only in this browser session, cleared when the session closes, and never saved inside a MuseFlow project.</p>
      <div className={`connection-option expanded ${connectedProviders.openai ? "connected" : ""}`}><span className="openai-mark">✺</span><div className="connection-details"><div className="connection-title"><div><b>ChatGPT Images</b><small>Generate and revise key frames from scene prompts.</small></div>{connectedProviders.openai && <em>● Connected</em>}</div><div className="key-entry"><input type={visibleKey === "openai" ? "text" : "password"} value={apiKeys.openai} onChange={(event) => setApiKeys((current) => ({ ...current, openai: event.target.value }))} placeholder={connectedProviders.openai ? "Paste a new key to replace the current one" : "sk-proj-…"} aria-label="OpenAI API key" autoComplete="off" /><button className="reveal-key" onClick={() => setVisibleKey(visibleKey === "openai" ? null : "openai")} aria-label={visibleKey === "openai" ? "Hide OpenAI key" : "Show OpenAI key"}>{visibleKey === "openai" ? "Hide" : "Show"}</button><button className="connect-key" onClick={() => saveApiKey("openai")}>{connectedProviders.openai ? "Update" : "Connect"}</button></div>{connectedProviders.openai && <button className="disconnect-key" onClick={() => disconnectApi("openai")}>Disconnect key</button>}</div></div>
      <div className={`connection-option expanded ${connectedProviders.higgsfield ? "connected" : ""}`}><span className="higgs-mark">H</span><div className="connection-details"><div className="connection-title"><div><b>Higgsfield Cloud</b><small>Prepare stills and motion packages for your video workflow.</small></div>{connectedProviders.higgsfield && <em>● Connected</em>}</div><div className="key-entry"><input type={visibleKey === "higgsfield" ? "text" : "password"} value={apiKeys.higgsfield} onChange={(event) => setApiKeys((current) => ({ ...current, higgsfield: event.target.value }))} placeholder={connectedProviders.higgsfield ? "Paste a new key_id:key_secret to replace it" : "key_id:key_secret"} aria-label="Higgsfield API key" autoComplete="off" /><button className="reveal-key" onClick={() => setVisibleKey(visibleKey === "higgsfield" ? null : "higgsfield")} aria-label={visibleKey === "higgsfield" ? "Hide Higgsfield key" : "Show Higgsfield key"}>{visibleKey === "higgsfield" ? "Hide" : "Show"}</button><button className="connect-key" onClick={() => saveApiKey("higgsfield")}>{connectedProviders.higgsfield ? "Update" : "Connect"}</button></div>{connectedProviders.higgsfield && <button className="disconnect-key" onClick={() => disconnectApi("higgsfield")}>Disconnect key</button>}</div></div>
      <div className="privacy-note"><b>Session-only privacy</b><span>MuseFlow does not add your keys to project exports or local project storage.</span></div></section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
