/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Settings, RotateCcw, Save, Check } from 'lucide-react';
import { ConversionSettings, TextFormat } from '../types';

interface SettingsPanelProps {
  settings: ConversionSettings;
  onUpdateSettings: (newSettings: ConversionSettings) => void;
  onResetSettings: () => void;
}

const FONTS = ['Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Consolas', 'Courier New', 'Roboto', 'Verdana'];
const LINE_SPACINGS = [
  { label: 'Single (1.0)', value: 100 },
  { label: '1.15', value: 115 },
  { label: '1.5', value: 150 },
  { label: 'Double (2.0)', value: 200 },
];

export default function SettingsPanel({ settings, onUpdateSettings, onResetSettings }: SettingsPanelProps) {
  
  const handleFormatChange = (key: keyof ConversionSettings, field: keyof TextFormat, value: any) => {
    const updatedFormat = {
      ...settings[key],
      [field]: value,
    };
    onUpdateSettings({
      ...settings,
      [key]: updatedFormat,
    });
  };

  const renderSection = (title: string, key: keyof ConversionSettings, description: string) => {
    const format = settings[key];

    return (
      <div className="bg-white p-4.5 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-xs transition duration-200 gap-3.5 flex flex-col" id={`settings-section-${key}`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 capitalize">
              {title === 'heading1' ? 'Heading 1 (Sections)' : title}
            </h4>
            <p className="text-[11px] text-slate-400 font-medium">{description}</p>
          </div>
          <div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-600 select-none">
              <input
                type="checkbox"
                checked={format.bold}
                onChange={(e) => handleFormatChange(key, 'bold', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              Bold
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
          {/* Font Family */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Global Font Family</label>
            <select
              value={format.fontFamily}
              onChange={(e) => handleFormatChange(key, 'fontFamily', e.target.value)}
              className="w-full text-xs font-semibold text-slate-700 bg-slate-55 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 focus:bg-white transition"
              id={`font-family-${key}`}
            >
              {FONTS.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Font Size (PT)</label>
            <input
              type="number"
              min={6}
              max={72}
              value={format.fontSize}
              onChange={(e) => handleFormatChange(key, 'fontSize', parseInt(e.target.value) || 11)}
              className="w-full text-xs font-semibold text-slate-700 bg-slate-55 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 focus:bg-white transition"
              id={`font-size-${key}`}
            />
          </div>

          {/* Line Spacing */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Line Spacing</label>
            <select
              value={format.lineSpacing}
              onChange={(e) => handleFormatChange(key, 'lineSpacing', parseInt(e.target.value) || 100)}
              className="w-full text-xs font-semibold text-slate-700 bg-slate-55 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 focus:bg-white transition"
              id={`line-spacing-${key}`}
            >
              {LINE_SPACINGS.map(ls => (
                <option key={ls.value} value={ls.value}>{ls.label}</option>
              ))}
            </select>
          </div>

          {/* Margins */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1" title="Paragraph space before in points">
                Before (PT)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={format.spaceAbove}
                onChange={(e) => handleFormatChange(key, 'spaceAbove', parseInt(e.target.value) || 0)}
                className="w-full text-xs font-semibold text-slate-700 bg-slate-55 border border-slate-200 rounded-lg px-1.5 py-1.5 outline-none focus:border-blue-500 focus:bg-white text-center transition"
                id={`space-above-${key}`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1" title="Paragraph space after in points">
                After (PT)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={format.spaceBelow}
                onChange={(e) => handleFormatChange(key, 'spaceBelow', parseInt(e.target.value) || 0)}
                className="w-full text-xs font-semibold text-slate-700 bg-slate-55 border border-slate-200 rounded-lg px-1.5 py-1.5 outline-none focus:border-blue-500 focus:bg-white text-center transition"
                id={`space-below-${key}`}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col gap-5 shadow-sm" id="conversion-settings-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3.5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-600" />
          <h3 className="font-bold text-slate-800 text-sm">Google Docs Conversions Presets</h3>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onResetSettings}
            className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 hover:shadow-sm px-2.5 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer transition select-none"
            id="btn-reset-defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Main sections */}
      <div className="flex flex-col gap-3">
        {renderSection('title', 'title', 'Applied to the main blog post title header')}
        {renderSection('heading1', 'heading1', 'Applied to primary headers (e.g. # or ##)')}
        {renderSection('text', 'text', 'Applied to general body paragraphs and regular sentences')}
        {renderSection('list', 'list', 'Applied to lists. Last bullet gets 8pt after spacing automatically.')}
      </div>

      {/* Persistence Note */}
      <div className="flex items-center justify-between mt-1 px-1 text-[11px] text-slate-400 font-medium">
        <p className="flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          Style settings are auto-saved to your browser.
        </p>
        <p className="hidden sm:block">Lines with list items format dynamically</p>
      </div>
    </div>
  );
}
