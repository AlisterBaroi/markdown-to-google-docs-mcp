/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Settings, RotateCcw, Save, Check } from "lucide-react";
import {
  ConversionSettings,
  TextFormat,
  RGBColor,
  HeadingMapping,
} from "../types";

interface SettingsPanelProps {
  settings: ConversionSettings;
  onUpdateSettings: (newSettings: ConversionSettings) => void;
  onResetSettings: () => void;
}

const FONTS = [
  "Arial",
  "Calibri",
  "Times New Roman",
  "Georgia",
  "Consolas",
  "Courier New",
  "Roboto",
  "Verdana",
];
const LINE_SPACINGS = [
  { label: "Single (1.0)", value: 100 },
  { label: "1.15", value: 115 },
  { label: "1.5", value: 150 },
  { label: "Double (2.0)", value: 200 },
];

export default function SettingsPanel({
  settings,
  onUpdateSettings,
  onResetSettings,
}: SettingsPanelProps) {
  const handleFormatChange = (
    key: keyof ConversionSettings,
    field: keyof TextFormat,
    value: any,
  ) => {
    const updatedFormat = {
      ...settings[key],
      [field]: value,
    };
    onUpdateSettings({
      ...settings,
      [key]: updatedFormat,
    });
  };

  const handleHeadingMappingChange = (
    key: keyof HeadingMapping,
    value: string,
  ) => {
    onUpdateSettings({
      ...settings,
      headingMapping: {
        ...settings.headingMapping,
        [key]: value,
      },
    });
  };

  const renderHeadingMapping = () => {
    const mapping = settings.headingMapping;
    const options = ["#", "##", "###", "####", "#####", "######"];

    const getAvailableOptions = (currentKey: keyof HeadingMapping) => {
      const selectOptions = currentKey === "title" ? ["None", ...options] : options;
      return selectOptions.map((opt) => {
        if (opt === "None") {
          return { value: opt, disabled: false };
        }
        // Find if this option is used by another key
        const usedBy = (
          Object.keys(mapping) as Array<keyof HeadingMapping>
        ).find((k) => k !== currentKey && mapping[k] === opt);
        return { value: opt, disabled: !!usedBy };
      });
    };

    return (
      <div className="bg-white dark:bg-slate-900/40 p-4.5 rounded-xl border border-slate-200 dark:border-slate-800/80 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-xs transition duration-200 gap-3.5 flex flex-col mb-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-white capitalize">
            Heading Mapping
          </h4>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Map markdown heading depths to styles
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            ["title", "heading1", "heading2"] as Array<keyof HeadingMapping>
          ).map((k) => (
            <div key={k}>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                {k === "heading1"
                  ? "H1 Mapping"
                  : k === "heading2"
                    ? "H2 Mapping"
                    : "Title Mapping"}
              </label>
              <select
                value={mapping[k]}
                onChange={(e) => handleHeadingMappingChange(k, e.target.value)}
                className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              >
                {getAvailableOptions(k).map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                  >
                    {opt.value}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hexToRGB = (hex: string): RGBColor => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { red: r, green: g, blue: b };
  };

  const rgbToHex = (color?: RGBColor): string => {
    if (!color) return "#000000";
    const r = Math.round(color.red * 255)
      .toString(16)
      .padStart(2, "0");
    const g = Math.round(color.green * 255)
      .toString(16)
      .padStart(2, "0");
    const b = Math.round(color.blue * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${r}${g}${b}`;
  };

  const renderSection = (
    title: string,
    key: keyof ConversionSettings,
    description: string,
  ) => {
    const format = settings[key] as TextFormat;

    return (
      <div
        className="bg-white dark:bg-slate-900/40 p-4.5 rounded-xl border border-slate-200 dark:border-slate-800/80 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-xs transition duration-200 gap-3.5 flex flex-col"
        id={`settings-section-${key}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-white capitalize">
              {title === "heading1"
                ? "Heading 1 (Sections)"
                : title === "heading2"
                  ? "Heading 2 (Subsections)"
                  : title}
            </h4>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Color
              <div className="flex items-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                <input
                  type="color"
                  value={rgbToHex(format.color)}
                  onChange={(e) =>
                    handleFormatChange(key, "color", hexToRGB(e.target.value))
                  }
                  className="w-6 h-6 p-0 border-0 cursor-pointer shrink-0 bg-transparent"
                  title="Choose color"
                />
                <input
                  type="text"
                  maxLength={7}
                  value={rgbToHex(format.color).toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                      handleFormatChange(key, "color", hexToRGB(val));
                    }
                  }}
                  onBlur={(e) => {
                    let val = e.target.value;
                    if (!val.startsWith("#")) val = "#" + val;
                    if (/^#[0-9A-Fa-f]{3}$/.test(val)) {
                      val =
                        "#" +
                        val[1] +
                        val[1] +
                        val[2] +
                        val[2] +
                        val[3] +
                        val[3];
                    }
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                      handleFormatChange(key, "color", hexToRGB(val));
                      e.target.value = val.toUpperCase();
                    } else {
                      e.target.value = rgbToHex(format.color).toUpperCase();
                    }
                  }}
                  className="w-[77px] px-1.5 py-1 text-xs font-mono font-semibold outline-none bg-transparent text-slate-700 dark:text-slate-300 uppercase shrink-0"
                  placeholder="#000000"
                />
              </div>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-350 select-none">
              <input
                type="checkbox"
                checked={format.bold}
                onChange={(e) =>
                  handleFormatChange(key, "bold", e.target.checked)
                }
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-500 focus:ring-blue-500 cursor-pointer shrink-0"
              />
              Bold
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
          {/* Font Family */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Font
            </label>
            <select
              value={format.fontFamily}
              onChange={(e) =>
                handleFormatChange(key, "fontFamily", e.target.value)
              }
              className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Size (PT)
            </label>
            <input
              type="number"
              min={6}
              max={72}
              value={format.fontSize}
              onChange={(e) =>
                handleFormatChange(
                  key,
                  "fontSize",
                  parseInt(e.target.value) || 11,
                )
              }
              className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
            />
          </div>

          {/* Line Spacing */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Line Spacing
            </label>
            <select
              value={format.lineSpacing}
              onChange={(e) =>
                handleFormatChange(
                  key,
                  "lineSpacing",
                  parseInt(e.target.value) || 100,
                )
              }
              className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
            >
              {LINE_SPACINGS.map((ls) => (
                <option key={ls.value} value={ls.value}>
                  {ls.label}
                </option>
              ))}
            </select>
          </div>

          {/* Margins */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1"
                title="Style space before in points"
              >
                Before
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={format.spaceAbove}
                onChange={(e) =>
                  handleFormatChange(
                    key,
                    "spaceAbove",
                    parseInt(e.target.value) || 0,
                  )
                }
                className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-1.5 py-1.5 outline-none focus:border-blue-500 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 text-center transition"
              />
            </div>
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1"
                title="Style space after in points"
              >
                After
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={format.spaceBelow}
                onChange={(e) =>
                  handleFormatChange(
                    key,
                    "spaceBelow",
                    parseInt(e.target.value) || 0,
                  )
                }
                className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-1.5 py-1.5 outline-none focus:border-blue-500 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 text-center transition"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 rounded-2xl flex flex-col gap-5 shadow-sm transition-colors duration-200"
      id="conversion-settings-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3.5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h3 className="font-bold text-slate-800 dark:text-white text-sm">
            Google Docs Conversions Presets
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0 relative">
          <button
            type="button"
            onClick={() => {
              onUpdateSettings({ ...settings });
              const el = document.getElementById("save-indicator");
              if (el) {
                el.style.opacity = "1";
                setTimeout(() => {
                  el.style.opacity = "0";
                }, 2000);
              }
            }}
            className="text-white bg-blue-600 hover:bg-blue-700 shadow-sm px-3.5 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition select-none"
            id="btn-save-settings"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save Settings</span>
            <span className="sm:hidden">Save</span>
          </button>
          <div
            id="save-indicator"
            className="absolute left-full ml-2 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs pointer-events-none transition-opacity duration-300 opacity-0 whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5" /> Saved!
          </div>
          <button
            type="button"
            onClick={onResetSettings}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:shadow-sm px-2.5 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer transition select-none"
            id="btn-reset-defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Defaults</span>
            <span className="sm:hidden">Reset</span>
          </button>
        </div>
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {renderHeadingMapping()}
        {/* Main sections */}
        <div className="flex flex-col gap-3">
          {renderSection(
            "title",
            "title",
            `Applied to the main blog post title (e.g. ${settings.headingMapping.title})`,
          )}
          {renderSection(
            "heading1",
            "heading1",
            `Applied to primary headers (e.g. ${settings.headingMapping.heading1})`,
          )}
          {renderSection(
            "heading2",
            "heading2",
            `Applied to secondary headers (e.g. ${settings.headingMapping.heading2})`,
          )}
          {renderSection("text", "text", "Applied to general body text")}

          {/* Inline Formatting Subsections */}
          <div className="ml-4 pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-3 py-1">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Inline Text Styles
            </h5>
            {renderSection("textBold", "textBold", "Applied to **bold** text")}
            {renderSection(
              "textItalic",
              "textItalic",
              "Applied to *italic* text",
            )}
            {renderSection(
              "textUnderline",
              "textUnderline",
              "Applied to __underlined__ text",
            )}
          </div>

          {renderSection(
            "list",
            "list",
            "Applied to lists. Last bullet gets auto bottom padding.",
          )}
        </div>
      </div>

      {/* Persistence Note */}
      <div className="flex items-center justify-between mt-1 px-1 text-[11px] text-slate-450 dark:text-slate-500 font-medium">
        <p className="flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          Settings automatically save to browser
        </p>
      </div>
    </div>
  );
}
