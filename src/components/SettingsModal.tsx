import { useEffect, useId, useState, type MouseEvent } from "react";
import {
  DEFAULT_SEED_SYSTEM_PROMPT,
  DEFAULT_SEED_USER_TEMPLATE,
  loadAppSettings,
  saveAppSettings,
} from "@/lib/appSettingsStorage";
import type { LlmProvider } from "@/lib/llmProvider";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Après enregistrement réussi (rechargement modèles, etc.). */
  onSaved?: () => void;
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const titleId = useId();
  const mistralKeyId = useId();
  const [seedSystem, setSeedSystem] = useState(DEFAULT_SEED_SYSTEM_PROMPT);
  const [seedUser, setSeedUser] = useState(DEFAULT_SEED_USER_TEMPLATE);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("mistral");
  const [mistralApiKey, setMistralApiKey] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = loadAppSettings();
    setSeedSystem(s.seedSystemPrompt);
    setSeedUser(s.seedUserTemplate);
    setLlmProvider(s.llmProvider);
    setMistralApiKey(s.mistralApiKey);
    setSaveError(null);
  }, [open]);

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
    saveAppSettings({
      seedSystemPrompt: sys,
      seedUserTemplate: usr,
      llmProvider,
      mistralApiKey: mistralApiKey.trim(),
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
              gabarit par défaut vise un <strong>assistant métier</strong> (pratiques,
              précautions, qualité) plutôt qu’une persona fictionnelle — structure librement
              inspirée des prompts <strong>OpenClaw</strong> (sections fixes).
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
              rows={4}
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
