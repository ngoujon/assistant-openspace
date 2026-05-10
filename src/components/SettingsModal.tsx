import { useEffect, useId, useState, type MouseEvent } from "react";
import {
  DEFAULT_SEED_SYSTEM_PROMPT,
  DEFAULT_SEED_USER_TEMPLATE,
  loadAppSettings,
  saveAppSettings,
} from "@/lib/appSettingsStorage";
import { pickDefaultChatModel } from "@/lib/llmModelPreference";
import type { LlmProvider } from "@/lib/llmProvider";
import { fetchMistralModels } from "@/lib/mistral";
import { fetchOllamaModels } from "@/lib/ollama";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Après enregistrement réussi (rechargement modèles, etc.). */
  onSaved?: () => void;
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const titleId = useId();
  const mistralKeyId = useId();
  const mistralModelSelectId = useId();
  const ollamaModelSelectId = useId();
  const [seedSystem, setSeedSystem] = useState(DEFAULT_SEED_SYSTEM_PROMPT);
  const [seedUser, setSeedUser] = useState(DEFAULT_SEED_USER_TEMPLATE);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("mistral");
  const [mistralApiKey, setMistralApiKey] = useState("");
  const [mistralModelsList, setMistralModelsList] = useState<string[]>([]);
  const [mistralModelChoice, setMistralModelChoice] = useState("");
  const [mistralModelsLoading, setMistralModelsLoading] = useState(false);
  const [mistralModelsError, setMistralModelsError] = useState<string | null>(
    null,
  );
  const [ollamaModelsList, setOllamaModelsList] = useState<string[]>([]);
  const [ollamaModelChoice, setOllamaModelChoice] = useState("");
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = loadAppSettings();
    setSeedSystem(s.seedSystemPrompt);
    setSeedUser(s.seedUserTemplate);
    setLlmProvider(s.llmProvider);
    setMistralApiKey(s.mistralApiKey);
    setMistralModelChoice(s.mistralChatModel?.trim() ?? "");
    setMistralModelsList([]);
    setMistralModelsError(null);
    setOllamaModelChoice(s.ollamaChatModel?.trim() ?? "");
    setOllamaModelsList([]);
    setOllamaModelsError(null);
    setSaveError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (llmProvider !== "mistral" || !mistralApiKey.trim()) {
      setMistralModelsLoading(false);
      setMistralModelsList([]);
      setMistralModelsError(null);
      return;
    }
    let cancelled = false;
    setMistralModelsLoading(true);
    setMistralModelsError(null);
    fetchMistralModels(mistralApiKey.trim())
      .then((list) => {
        if (cancelled) return;
        setMistralModelsList(list);
        setMistralModelChoice((cur) => {
          const t = cur.trim();
          if (t && list.includes(t)) return t;
          const s = loadAppSettings();
          const saved = s.mistralChatModel?.trim() ?? "";
          if (saved && list.includes(saved)) return saved;
          return pickDefaultChatModel(list, "mistral");
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setMistralModelsList([]);
        setMistralModelsError(e.message);
      })
      .finally(() => {
        if (!cancelled) setMistralModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, llmProvider, mistralApiKey]);

  useEffect(() => {
    if (!open) return;
    if (llmProvider !== "ollama") {
      setOllamaModelsLoading(false);
      setOllamaModelsList([]);
      setOllamaModelsError(null);
      return;
    }
    let cancelled = false;
    setOllamaModelsLoading(true);
    setOllamaModelsError(null);
    fetchOllamaModels()
      .then((list) => {
        if (cancelled) return;
        setOllamaModelsList(list);
        setOllamaModelChoice((cur) => {
          const t = cur.trim();
          if (t && list.includes(t)) return t;
          const s = loadAppSettings();
          const saved = s.ollamaChatModel?.trim() ?? "";
          if (saved && list.includes(saved)) return saved;
          return pickDefaultChatModel(list, "ollama");
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setOllamaModelsList([]);
        setOllamaModelsError(e.message);
      })
      .finally(() => {
        if (!cancelled) setOllamaModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, llmProvider]);

  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleResetSeedPrompts = () => {
    setSeedSystem(DEFAULT_SEED_SYSTEM_PROMPT);
    setSeedUser(DEFAULT_SEED_USER_TEMPLATE);
    setSaveError(null);
  };

  const handleSave = () => {
    const sys = seedSystem.trim();
    const usr = seedUser.trim();
    if (!sys) {
      setSaveError("Le message système pour le seed ne peut pas être vide.");
      return;
    }
    if (!usr) {
      setSaveError("Le gabarit utilisateur pour le seed ne peut pas être vide.");
      return;
    }
    if (llmProvider === "mistral" && !mistralApiKey.trim()) {
      setSaveError(
        "Avec Mistral AI, renseigne ta clé API (ou repasse sur Ollama local).",
      );
      return;
    }
    if (
      llmProvider === "mistral" &&
      mistralApiKey.trim() &&
      mistralModelsList.length > 0 &&
      !mistralModelChoice.trim()
    ) {
      setSaveError("Choisis un modèle Mistral dans la liste.");
      return;
    }
    if (
      llmProvider === "ollama" &&
      ollamaModelsList.length > 0 &&
      !ollamaModelChoice.trim()
    ) {
      setSaveError("Choisis un modèle Ollama dans la liste.");
      return;
    }
    const prev = loadAppSettings();
    saveAppSettings({
      seedSystemPrompt: sys,
      seedUserTemplate: usr,
      llmProvider,
      mistralApiKey: mistralApiKey.trim(),
      mistralChatModel:
        llmProvider === "mistral"
          ? mistralModelChoice.trim()
          : prev.mistralChatModel,
      ollamaChatModel:
        llmProvider === "ollama"
          ? ollamaModelChoice.trim()
          : prev.ollamaChatModel,
    });
    setSaveError(null);
    onSaved?.();
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        className="modal-dialog modal-dialog-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker">Configuration</p>
            <h2 className="modal-title" id={titleId}>
              Paramètres
            </h2>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="modal-settings-scroll">
          <section
            className="modal-settings-section"
            aria-labelledby="settings-llm-heading"
          >
            <h3 className="modal-settings-section-title" id="settings-llm-heading">
              Fournisseur LLM
            </h3>
            <p className="modal-settings-intro">
              Par défaut l’app utilise <strong>Mistral AI</strong> (API cloud). Tu peux
              repasser sur <strong>Ollama</strong> installé sur ta machine pour tout
              exécuter en local. Les requêtes passent par le même domaine que l’UI (
              <code className="modal-settings-code">/api/mistral</code> ou{" "}
              <code className="modal-settings-code">/api/ollama</code>) pour éviter les
              blocages CORS.
            </p>
            <fieldset className="modal-settings-fieldset">
              <legend className="modal-settings-legend-sr">Choisir le fournisseur</legend>
              <label className="modal-settings-radio-row">
                <input
                  type="radio"
                  name="llm-provider"
                  checked={llmProvider === "mistral"}
                  onChange={() => setLlmProvider("mistral")}
                />
                <span>
                  <strong>Mistral AI</strong> (cloud, compte sur{" "}
                  <a
                    href="https://console.mistral.ai/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    console.mistral.ai
                  </a>
                  )
                </span>
              </label>
              <label className="modal-settings-radio-row">
                <input
                  type="radio"
                  name="llm-provider"
                  checked={llmProvider === "ollama"}
                  onChange={() => setLlmProvider("ollama")}
                />
                <span>
                  <strong>Ollama</strong> (local,{" "}
                  <code className="modal-settings-code">ollama serve</code> sur ce Mac)
                </span>
              </label>
            </fieldset>
            {llmProvider === "mistral" && (
              <>
                <label className="modal-field-label" htmlFor={mistralKeyId}>
                  Clé API Mistral
                </label>
                <input
                  id={mistralKeyId}
                  type="password"
                  className="modal-settings-input"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Colle la clé créée sur console.mistral.ai"
                  value={mistralApiKey}
                  onChange={(e) => setMistralApiKey(e.target.value)}
                />
                <p className="modal-settings-hint">
                  Indique ta clé ici : elle est enregistrée <strong>dans ce navigateur</strong>{" "}
                  (localStorage), pas sur un serveur OpenSpace. Pour la rotation ou la
                  révocation, utilise la console Mistral.
                </p>
                <label
                  className="modal-field-label modal-settings-label-block"
                  htmlFor={mistralModelSelectId}
                >
                  Modèle (Mistral AI)
                </label>
                <p className="modal-settings-hint">
                  Utilisé pour le chat, les missions et l’édition d’équipe (Organisation).
                  Tu ne peux pas le changer depuis la barre du chat.
                </p>
                {mistralModelsLoading && (
                  <p className="modal-settings-hint" aria-live="polite">
                    Chargement des modèles…
                  </p>
                )}
                {mistralModelsError && (
                  <p className="modal-gen-error" role="alert">
                    {mistralModelsError}
                  </p>
                )}
                {!mistralModelsLoading && mistralApiKey.trim() && (
                  <select
                    id={mistralModelSelectId}
                    className="modal-settings-input"
                    value={mistralModelChoice}
                    onChange={(e) => setMistralModelChoice(e.target.value)}
                    disabled={mistralModelsList.length === 0}
                  >
                    {mistralModelsList.length === 0 ? (
                      <option value="">—</option>
                    ) : (
                      mistralModelsList.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </>
            )}
            {llmProvider === "ollama" && (
              <>
                <label
                  className="modal-field-label modal-settings-label-block"
                  htmlFor={ollamaModelSelectId}
                >
                  Modèle (Ollama)
                </label>
                <p className="modal-settings-hint">
                  Utilisé pour le chat, les missions et l’édition d’équipe (Organisation).
                  Choix disponible ici uniquement — plus dans la barre du chat.
                </p>
                {ollamaModelsLoading && (
                  <p className="modal-settings-hint" aria-live="polite">
                    Chargement des modèles Ollama…
                  </p>
                )}
                {ollamaModelsError && (
                  <p className="modal-gen-error" role="alert">
                    {ollamaModelsError}
                  </p>
                )}
                {!ollamaModelsLoading && (
                  <select
                    id={ollamaModelSelectId}
                    className="modal-settings-input"
                    value={ollamaModelChoice}
                    onChange={(e) => setOllamaModelChoice(e.target.value)}
                    disabled={ollamaModelsList.length === 0}
                  >
                    {ollamaModelsList.length === 0 ? (
                      <option value="">—</option>
                    ) : (
                      ollamaModelsList.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </>
            )}
          </section>

          <section className="modal-settings-section" aria-labelledby="settings-seed-heading">
            <h3 className="modal-settings-section-title" id="settings-seed-heading">
              Génération de seed (Équipe)
            </h3>
            <p className="modal-settings-intro">
              Ces textes sont envoyés au <strong>fournisseur LLM</strong> choisi ci-dessus
              lorsque tu cliques sur « Générer un seed » dans la fiche d’un membre. Le
              gabarit par défaut vise un expert <strong>étroitement spécialisé</strong> dans
              le métier déduit du libellé (périmètre clair, hors-sujet explicite), avec des{" "}
              <strong>positions et arguments techniques</strong> possibles à l’intérieur de
              ce domaine — pas une persona fictionnelle ; sections fixes type OpenClaw.
            </p>
            <label className="modal-field-label" htmlFor="settings-seed-system">
              Message système
            </label>
            <textarea
              id="settings-seed-system"
              className="modal-settings-textarea modal-settings-textarea--short"
              value={seedSystem}
              onChange={(e) => setSeedSystem(e.target.value)}
              spellCheck={false}
              rows={6}
            />
            <label
              className="modal-field-label modal-settings-label-block"
              htmlFor="settings-seed-user"
            >
              Gabarit du message utilisateur
            </label>
            <p className="modal-settings-hint">
              Placeholders obligatoires pour l’injection runtime :{" "}
              <code className="modal-settings-code">{"{{memberLabel}}"}</code> (nom) et{" "}
              <code className="modal-settings-code">{"{{place}}"}</code> (phrase sur la place
              dans l’organigramme). Tu peux les placer où tu veux dans tes sections.
            </p>
            <textarea
              id="settings-seed-user"
              className="modal-settings-textarea"
              value={seedUser}
              onChange={(e) => setSeedUser(e.target.value)}
              spellCheck={false}
              rows={22}
            />
            <button
              type="button"
              className="btn-link modal-settings-reset"
              onClick={handleResetSeedPrompts}
            >
              Réinitialiser les prompts seed aux valeurs par défaut
            </button>
          </section>
          {saveError && (
            <p className="modal-gen-error" role="alert">
              {saveError}
            </p>
          )}
        </div>

        <footer className="modal-footer">
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={handleSave}>
              Enregistrer
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
