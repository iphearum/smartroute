import {
  FiAlertCircle,
  FiCheck,
  FiMousePointer,
  FiSlash,
  FiSettings,
  FiShield,
} from "react-icons/fi";
import { permissionOptions, type PermissionMode } from "./assistant-types";

export function AssistantPermissionMenu({
  value,
  onChange,
}: {
  value: PermissionMode;
  onChange: (value: PermissionMode) => void;
}) {
  return (
    <div
      className="assistant-permission-menu"
      role="menu"
      aria-label="Choose map tool permissions"
    >
      <div className="assistant-permission-menu-header">
        How should map actions be approved?
      </div>
      {permissionOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`assistant-permission-option ${value === option.id ? "selected" : ""}`}
          role="menuitemradio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
        >
          <span className="assistant-permission-option-icon">
            {option.id === "full" ? (
              <FiAlertCircle aria-hidden="true" />
            ) : option.id === "disabled" ? (
              <FiSlash aria-hidden="true" />
            ) : option.id === "automatic" ? (
              <FiSettings aria-hidden="true" />
            ) : option.id === "ask" ? (
              <FiMousePointer aria-hidden="true" />
            ) : (
              <FiShield aria-hidden="true" />
            )}
          </span>
          <span className="assistant-permission-option-copy">
            <strong>{option.title}</strong>
            <span>{option.description}</span>
          </span>
          {value === option.id && (
            <span className="assistant-permission-check">
              <FiCheck aria-hidden="true" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
