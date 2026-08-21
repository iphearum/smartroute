import {
  FiCheck,
  FiChevronRight,
  FiGlobe,
  FiMapPin,
  FiMaximize,
  FiPaperclip,
  FiRefreshCw,
  FiTrash2,
  FiTool,
} from "react-icons/fi";

export function AssistantToolMenu({
  onAddFiles,
  onWebSearch,
  onMapSearch,
  onPermissions,
  onMapAction,
}: {
  onAddFiles: () => void;
  onWebSearch: () => void;
  onMapSearch: () => void;
  onPermissions: () => void;
  onMapAction: (action: "reset" | "clear" | "focus") => void;
}) {
  return (
    <div
      className="assistant-tool-menu gap-1"
      role="menu"
      aria-label="Assistant tools"
    >
      <button
        type="button"
        className="assistant-tool-menu-item"
        onClick={onAddFiles}
      >
        <span className="assistant-tool-menu-icon">
          <FiPaperclip aria-hidden="true" />
        </span>
        <span>Add photos &amp; files</span>
      </button>
      <button
        type="button"
        className="assistant-tool-menu-item"
        onClick={onMapSearch}
      >
        <span className="assistant-tool-menu-icon">
          <FiMapPin aria-hidden="true" />
        </span>
        <span>Find map places</span>
      </button>
      <button
        type="button"
        className="assistant-tool-menu-item"
        onClick={onWebSearch}
      >
        <span className="assistant-tool-menu-icon">
          <FiGlobe aria-hidden="true" />
        </span>
        <span>Search web</span>
        <span className="assistant-tool-menu-check">
          <FiCheck aria-hidden="true" />
        </span>
      </button>
      <div className="assistant-tool-menu-divider" />
      <MapAction
        icon={<FiRefreshCw aria-hidden="true" />}
        label="Reset map"
        onClick={() => onMapAction("reset")}
      />
      <MapAction
        icon={<FiTrash2 aria-hidden="true" />}
        label="Clear route points"
        onClick={() => onMapAction("clear")}
      />
      <MapAction
        icon={<FiMaximize aria-hidden="true" />}
        label="Focus selected route"
        onClick={() => onMapAction("focus")}
      />
      <button
        type="button"
        className="assistant-tool-menu-item"
        onClick={onPermissions}
      >
        <span className="assistant-tool-menu-icon">
          <FiTool aria-hidden="true" />
        </span>
        <span>Tool permissions</span>
        <span className="assistant-tool-menu-chevron">
          <FiChevronRight aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

function MapAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="assistant-tool-menu-item"
      onClick={onClick}
    >
      <span className="assistant-tool-menu-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
