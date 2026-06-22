import React from 'react'

// Read-only summary of a referenced skill. Skills are external artifacts, so
// unlike PlaybookPreview this never recurses and is never editable — it shows
// the skill's description (its summary) plus where the SKILL.md lives.
export default function SkillPreview({ skill }) {
  return (
    <div className="preview skill-preview">
      {skill.description ? (
        <div className="preview-desc">{skill.description}</div>
      ) : (
        <div className="preview-empty">(no description)</div>
      )}
      <div className="skill-source">{skill.source}</div>
    </div>
  )
}
