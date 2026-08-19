import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  clampOllamaTemperature,
  DEFAULT_OLLAMA_TEMPERATURE,
  DEFAULT_OLLAMA_API_URL,
  DEFAULT_SEED_SYSTEM_PROMPT,
  DEFAULT_SEED_USER_TEMPLATE,
  loadAppSettings,
  saveAppSettings,
} from "@/lib/appSettingsStorage";
import { pickDefaultChatModel } from "@/lib/llmModelPreference";
import { fetchOllamaModels } from "@/lib/ollama";
import {
  applyWorkspaceImport,
  downloadWorkspaceExport,
  parseWorkspaceImport,
} from "@/lib/exportImport";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Après enregistrement réussi (rechargement modèles, etc.). */
  onSaved?: () => void;
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const ollamaApiKeyId = useId();
  const ollamaApiUrlId = useId();
  const ollamaTemperatureId = useId();
  const ollamaModelSelectId = useId();
  const [seedSystem, setSeedSystem] = useState(DEFAULT_SEED_SYSTEM_PROMPT);
  const [seedUser, setSeedUser] = useState(DEFAULT_SEED_USER_TEMPLATE);
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [ollamaApiUrl, setOllamaApiUrl] = useState(DEFAULT_OLLAMA_API_URL);
  const [ollamaTemperature, setOllamaTemperature] = useState(
    DEFAULT_OLLAMA_TEMPERATURE,
  );
  const [ollamaModelsList, setOllamaModelsList] = useState<string[]>([]);
  const [ollamaModelChoice, setOllamaModelChoice] = useState("");
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = loadAppSettings();
    setSeedSystem(s.seedSystemPrompt);
    setSeedUser(s.seedUserTemplate);
    setOllamaApiKey(s.ollamaApiKey ?? "");
    setOllamaApiUrl(s.ollamaApiUrl ?? DEFAULT_OLLAMA_API_URL);
    setOllamaTemperature(clampOllamaTemperature(s.ollamaTemperature));
    setOllamaModelChoice(s.ollamaChatModel?.trim() ?? "");
    setOllamaModelsList([]);
    setOllamaModelsError(null);
    setSaveError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOllamaModelsLoading(true);
    setOllamaModelsError(null);
    fetchOllamaModels(ollamaApiUrl, ollamaApiKey)
      .then((list) => {
        if (cancelled) return;
        setOllamaModelsList(list);
        setOllamaModelChoice((cur) => {
          const t = cur.trim();
          if (t && list.includes(t)) return t;
          const s = loadAppSettings();
          const saved = s.ollamaChatModel?.trim() ?? "";
          if (saved && list.includes(saved)) return saved;
          return pickDefaultChatModel(list);
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
  }, [open, ollamaApiUrl, ollamaApiKey]);

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

  useFocusTrap(open, dialogRef);

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
    const urlTrim = ollamaApiUrl.trim();
    if (!urlTrim) {
      setSaveError("L'URL Ollama Cloud ne peut pas être vide.");
      return;
    }
    try {
      new URL(urlTrim);
    } catch {
      setSaveError("L'URL Ollama Cloud n'est pas valide.");
      return;
    }
    if (
      ollamaModelsList.length > 0 &&
      !ollamaModelChoice.trim()
    ) {
      setSaveError("Choisis un modèle Ollama dans la liste.");
      return;
    }
    saveAppSettings({
      seedSystemPrompt: sys,
      seedUserTemplate: usr,
      llmProvider: "ollama",
      ollamaApiKey: ollamaApiKey.trim(),
      ollamaApiUrl: urlTrim,
      ollamaChatModel: ollamaModelChoice.trim(),
      ollamaTemperature: clampOllamaTemperature(ollamaTemperature),
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
        ref={dialogRef}
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
              Fournisseur LLM : Ollama Cloud
            </h3>
            <p className="modal-settings-intro">
              L’app utilise <strong>Ollama Cloud</strong> pour accéder aux modèles. Les requêtes
              passent par le même domaine que l’UI (
              <code className="modal-settings-code">/api/ollama</code>) pour éviter les
              blocages CORS.
            </p>
            <label className="modal-field-label" htmlFor={ollamaApiKeyId}>
              Clé API Ollama Cloud (optionnel)
            </label>
            <input
              id={ollamaApiKeyId}
              type="password"
              className="modal-settings-input"
              autoComplete="off"
              spellCheck={false}
              placeholder="Laisse vide si tu utilises Ollama sans authentification"
              value={ollamaApiKey}
              onChange={(e) => setOllamaApiKey(e.target.value)}
            />
            <p className="modal-settings-hint">
              Si tu as besoin d’authentifier auprès d’Ollama Cloud, indique ta clé ici.
              Elle est enregistrée <strong>dans ce navigateur</strong> (localStorage), pas sur
              un serveur OpenSpace.
            </p>
            <label className="modal-field-label" htmlFor={ollamaApiUrlId}>
              URL Ollama Cloud
            </label>
            <input
              id={ollamaApiUrlId}
              type="url"
              className="modal-settings-input"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://api.ollama.cloud/v1"
              value={ollamaApiUrl}
              onChange={(e) => setOllamaApiUrl(e.target.value)}
            />
            <p className="modal-settings-hint">
              L’adresse de base d’Ollama Cloud (incluant le protocol et le chemin d’API si
              nécessaire). Par défaut : https://api.ollama.cloud/v1
            </p>
            <label
              className="modal-field-label modal-settings-label-block"
              htmlFor={ollamaModelSelectId}
            >
              Modèle (Ollama Cloud)
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
            <label
              className="modal-field-label modal-settings-label-block"
              htmlFor={ollamaTemperatureId}
            >
              Température (Ollama)
            </label>
            <p className="modal-settings-hint">
              S’applique au <strong>chat</strong>, aux <strong>missions</strong>, à la{" "}
              <strong>fusion du livrable</strong> et à la <strong>génération de seeds</strong>.
              Plus bas = plus déterministe ; plus haut = plus de variété (0 à 1).
            </p>
            <div className="modal-settings-temp-row">
              <input
                id={ollamaTemperatureId}
                type="range"
                className="modal-settings-range"
                min={0}
                max={1}
                step={0.05}
                value={ollamaTemperature}
                onChange={(e) =>
                  setOllamaTemperature(Number(e.target.value))
                }
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={ollamaTemperature}
                aria-valuetext={`${ollamaTemperature.toFixed(2)}`}
              />
              <span className="modal-settings-temp-value" aria-live="polite">
                {ollamaTemperature.toFixed(2)}
              </span>
            </div>
          </section>

          <section
            className="modal-settings-section"
            aria-labelledby="settings-data-heading"
          >
            <h3 className="modal-settings-section-title" id="settings-data-heading">
              Sauvegarde et restauration
            </h3>
            <p className="modal-settings-hint">
              Exporte ou importe conversations, équipe, archives et paramètres (JSON
              local).
            </p>
            <div className="modal-settings-data-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => downloadWorkspaceExport()}
              >
                Exporter les données
              </button>
              <label className="btn-secondary modal-import-label">
                Importer…
                <input
                  type="file"
                  accept="application/json,.json"
                  className="modal-import-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    void file.text().then((raw) => {
                      try {
                        const payload = parseWorkspaceImport(raw);
                        const result = applyWorkspaceImport(payload);
                        setImportStatus(
                          `Import réussi : ${result.conversations} conversation(s), ${result.teamMembers} membre(s), ${result.archives} archive(s). Recharge la page.`,
                        );
                        onSaved?.();
                      } catch (err) {
                        setImportStatus((err as Error).message);
                      }
                    });
                  }}
                />
              </label>
            </div>
            {importStatus ? (
              <p className="modal-settings-hint" role="status">
                {importStatus}
              </p>
            ) : null}
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
