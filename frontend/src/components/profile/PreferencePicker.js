function optionLabel(option) {
  return option.name || option.meetingName || option.id;
}

function PreferencePicker({ label, help, options, selectedIds, onChange, disabled = false }) {
  const selected = new Set((selectedIds || []).map(String));
  const selectedOptions = options.filter((option) => selected.has(String(option.id)));

  const addOption = (event) => {
    const id = event.target.value;
    if (id && !selected.has(id)) onChange([...selectedIds, id]);
    event.target.value = '';
  };

  const removeOption = (id) => {
    onChange(selectedIds.filter((selectedId) => String(selectedId) !== String(id)));
  };

  return (
    <div className="profile-preference-picker">
      <label>{label}</label>
      <div className="profile-field-note">{help}</div>
      <select
        aria-label={`Add ${label.toLowerCase()}`}
        defaultValue=""
        onChange={addOption}
        disabled={disabled || options.length === 0}
      >
        <option value="">{options.length ? `Choose ${label.toLowerCase()}…` : 'No options available'}</option>
        {options
          .filter((option) => !selected.has(String(option.id)))
          .map((option) => (
            <option value={String(option.id)} key={option.id}>{optionLabel(option)}</option>
          ))}
      </select>
      <div className="profile-preference-chips" aria-label={`Selected ${label.toLowerCase()}`}>
        {selectedOptions.length === 0 && <span className="profile-empty-choice">None selected</span>}
        {selectedOptions.map((option) => (
          <button
            className="profile-preference-chip"
            type="button"
            onClick={() => removeOption(option.id)}
            disabled={disabled}
            aria-label={`Remove ${optionLabel(option)}`}
            key={option.id}
          >
            {optionLabel(option)} <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default PreferencePicker;
