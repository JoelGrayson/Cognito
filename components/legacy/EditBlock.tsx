"use client";

import { useState } from "react";
import type { MapNode } from "@/lib/schema";

/** Rename a block and change what it covers. */
export function EditBlock({
  node,
  onSave,
  onCancel,
}: {
  node: MapNode;
  onSave: (patch: { name: string; subtitle: string; description: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(node.name);
  const [subtitle, setSubtitle] = useState(node.subtitle);
  const [description, setDescription] = useState(node.description);
  return (
    <div className="edit-backdrop" role="dialog" aria-modal="true" aria-label={`Edit ${node.name}`} onClick={onCancel}>
      <form
        className="edit-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave({ name: name.trim(), subtitle: subtitle.trim(), description: description.trim() });
        }}
      >
        <h2 className="text-lg font-medium">Edit block</h2>
        <label className="edit-field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </label>
        <label className="edit-field">
          <span>Key concepts</span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={120}
            placeholder="comma, separated, concepts"
          />
        </label>
        <label className="edit-field">
          <span>What it covers</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={400} />
        </label>
        <p className="text-xs text-neutral-500">
          Renaming a block starts its lesson again; the old one stays under the old name.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="code-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="code-btn code-btn-primary" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
