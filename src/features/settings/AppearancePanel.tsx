import { Check, Moon, Sun, Monitor } from "lucide-react";
import type { ThemePreference } from "../../hooks/useTheme";
import type {
  PerformanceSettings,
  BackgroundPollingMode,
} from "../../hooks/usePerformanceSettings";
import {
  ACCENTS,
  useAppearanceSettings,
  type AppearanceSettings,
} from "../../hooks/useAppearanceSettings";
import {
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "./SettingsControls";

const WALLPAPERS = Array.from(
  { length: 12 },
  (_, index) =>
    `/wallpapers/wallpaper-${String(index + 1).padStart(2, "0")}.jpg`,
);
export default function AppearancePanel({
  theme,
  changeTheme,
  wallpaper,
  changeWallpaper,
  performance,
  updatePerformance,
}: {
  theme: ThemePreference;
  changeTheme: (value: ThemePreference) => void;
  wallpaper: string;
  changeWallpaper: (value: string) => void;
  performance: PerformanceSettings;
  updatePerformance: (value: Partial<PerformanceSettings>) => void;
}) {
  const { appearance, updateAppearance } = useAppearanceSettings();
  return (
    <div className="appearance-panel ui-enter">
      <div className="appearance-intro">
        <h2>Make HomiOS feel like you</h2>
        <p>Make it bold, calm, colorful, or entirely your own.</p>
      </div>
      <div className="appearance-columns">
        <div className="space-y-4">
          <SettingsSection title="Look & feel">
            <SettingsRow
              label="Theme"
              description="A look for every time of day."
            >
              <div
                className="settings-segmented"
                role="group"
                aria-label="Color theme"
              >
                {[
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                  { id: "system", label: "Auto", icon: Monitor },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={theme === option.id}
                    onClick={() => changeTheme(option.id as ThemePreference)}
                  >
                    <option.icon size={17} />
                    {option.label}
                  </button>
                ))}
              </div>
            </SettingsRow>
            <SettingsRow
              label="Accent color"
              description="Highlights, controls, and active navigation."
            >
              <div className="settings-accent-options">
                {Object.entries(ACCENTS).map(([id, color]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`${id} accent`}
                    aria-pressed={appearance.accent === id}
                    style={{ background: color }}
                    onClick={() =>
                      updateAppearance({
                        accent: id as AppearanceSettings["accent"],
                      })
                    }
                  >
                    {appearance.accent === id && <Check size={18} />}
                  </button>
                ))}
              </div>
            </SettingsRow>
            <SettingsRow
              label="Interface spacing"
              description="Comfortable or a little more compact."
            >
              <select
                aria-label="Interface spacing"
                value={appearance.density}
                onChange={(event) =>
                  updateAppearance({
                    density: event.target
                      .value as AppearanceSettings["density"],
                  })
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </SettingsRow>
            <SettingsRow
              label="Desktop icon size"
              description="Give your favorite apps room to stand out."
            >
              <select
                aria-label="Desktop icon size"
                value={appearance.iconSize}
                onChange={(event) =>
                  updateAppearance({
                    iconSize: event.target
                      .value as AppearanceSettings["iconSize"],
                  })
                }
              >
                <option value="regular">Regular</option>
                <option value="large">Large</option>
              </select>
            </SettingsRow>
          </SettingsSection>
          <SettingsSection
            title="Motion & performance"
            description="Keep the experience comfortable for you and your server."
          >
            <SettingsRow
              label="Resource profile"
              description="Choose the balance between detail and resource use."
            >
              <select
                aria-label="Resource profile"
                value={performance.profile}
                onChange={(event) => {
                  const profile = event.target
                    .value as PerformanceSettings["profile"];
                  updatePerformance({
                    profile,
                    backgroundPolling:
                      profile === "beautiful"
                        ? "live"
                        : profile === "server_saver"
                          ? "quiet"
                          : "balanced",
                    glassSurfaces: profile !== "server_saver",
                    reduceMotion: profile === "server_saver",
                  });
                }}
              >
                <option value="beautiful">Beautiful</option>
                <option value="balanced">Balanced</option>
                <option value="server_saver">Server Saver</option>
              </select>
            </SettingsRow>
            <SettingsRow
              label="Glass surfaces"
              description="Rich materials on your desktop and dock."
              compact
            >
              <SettingsSwitch
                label="Glass surfaces"
                checked={performance.glassSurfaces}
                onChange={(glassSurfaces) =>
                  updatePerformance({ glassSurfaces })
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Reduce motion"
              description="Calmer transitions. System preferences are also respected."
              compact
            >
              <SettingsSwitch
                label="Reduce motion"
                checked={performance.reduceMotion}
                onChange={(reduceMotion) => updatePerformance({ reduceMotion })}
              />
            </SettingsRow>
            <SettingsRow
              label="Background activity"
              description="How often live information updates."
            >
              <select
                aria-label="Background activity"
                value={performance.backgroundPolling}
                onChange={(event) =>
                  updatePerformance({
                    backgroundPolling: event.target
                      .value as BackgroundPollingMode,
                  })
                }
              >
                <option value="live">Live</option>
                <option value="balanced">Balanced</option>
                <option value="quiet">Quiet</option>
              </select>
            </SettingsRow>
          </SettingsSection>
        </div>
        <aside className="settings-wallpaper-panel">
          <div className="settings-wallpaper-preview">
            <img src={wallpaper} alt="Current desktop wallpaper" />
            <span>Your desktop</span>
          </div>
          <div className="settings-wallpaper-heading">
            <h2>Wallpaper</h2>
            <p>A fresh view, every time you come home.</p>
          </div>
          <div className="settings-wallpaper-grid">
            {WALLPAPERS.map((value, index) => (
              <button
                key={value}
                type="button"
                aria-label={`Use wallpaper ${index + 1}`}
                aria-pressed={wallpaper === value}
                onClick={() => changeWallpaper(value)}
              >
                <img src={value} alt="" loading="lazy" />
                {wallpaper === value && (
                  <span>
                    <Check size={15} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
