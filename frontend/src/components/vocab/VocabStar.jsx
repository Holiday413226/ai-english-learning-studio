/**
 * VocabStar — reusable ⭐ button for saving words to Vocab Vault.
 *
 * Props:
 *   word          — the word to save
 *   context       — sentence where the word was found (optional)
 *   sourceModule  — "novel" | "diary" | "debater" | "minecraft"
 *   apiKey        — DeepSeek API key (for AI definition generation, optional)
 *   onSaved       — callback after successful save
 */
import { useState } from "react";
import { addWordToVault } from "../../systems/vocab/api";

export default function VocabStar({ word, context, sourceModule, apiKey, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (saving || saved) return;
    setSaving(true);
    try {
      await addWordToVault(word, sourceModule, context || "", apiKey || "");
      setSaved(true);
      onSaved?.();
    } catch {
      // Silently fail — word is still in vault without AI definition
      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      className="vocab-star-btn"
      onClick={handleClick}
      disabled={saving || saved}
      title={saved ? "Saved to Vocab Vault" : "Save to Vocab Vault"}
      style={{
        background: "none",
        border: "none",
        cursor: saved ? "default" : "pointer",
        fontSize: "1rem",
        padding: "2px 4px",
        opacity: saved ? 0.6 : 1,
        transition: "transform 0.15s",
      }}
    >
      {saved ? "⭐" : saving ? "⏳" : "☆"}
    </button>
  );
}
