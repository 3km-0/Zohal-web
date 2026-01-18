'use client';

import { useState } from 'react';
import {
  Shield,
  Mail,
  Phone,
  Building2,
  CreditCard,
  User,
  Hash,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  RedactionCategory,
  CATEGORY_INFO,
  AUTO_DETECTED_CATEGORIES,
  type PrivacyModeConfig,
} from '@/lib/sanitizer';

interface PrivacySettingsPanelProps {
  config: PrivacyModeConfig;
  onChange: (config: PrivacyModeConfig) => void;
  disabled?: boolean;
}

// Map categories to icons
const CATEGORY_ICONS: Record<RedactionCategory, typeof Mail> = {
  [RedactionCategory.email]: Mail,
  [RedactionCategory.phone]: Phone,
  [RedactionCategory.iban]: Building2,
  [RedactionCategory.nationalId]: User,
  [RedactionCategory.creditCard]: CreditCard,
  [RedactionCategory.crNumber]: Building2,
  [RedactionCategory.unifiedNumber]: Hash,
  [RedactionCategory.custom]: Hash,
};

export function PrivacySettingsPanel({
  config,
  onChange,
  disabled = false,
}: PrivacySettingsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const toggleCategory = (category: RedactionCategory) => {
    if (disabled) return;
    
    const newEnabled = new Set(config.enabledCategories);
    if (newEnabled.has(category)) {
      newEnabled.delete(category);
    } else {
      newEnabled.add(category);
    }
    onChange({ ...config, enabledCategories: newEnabled });
  };

  const addCustomString = () => {
    const trimmed = customInput.trim();
    if (!trimmed || trimmed.length < 2) return;
    if (config.customStrings.includes(trimmed)) return;

    onChange({
      ...config,
      customStrings: [...config.customStrings, trimmed],
    });
    setCustomInput('');
  };

  const removeCustomString = (str: string) => {
    onChange({
      ...config,
      customStrings: config.customStrings.filter(s => s !== str),
    });
  };

  const enabledCount = config.enabledCategories.size + (config.customStrings.length > 0 ? 1 : 0);

  return (
    <div className={cn('rounded-xl border border-border bg-surface', disabled && 'opacity-60')}>
      {/* Header - always visible */}
      <button
        onClick={() => !disabled && setExpanded(!expanded)}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between p-4 text-left',
          !disabled && 'hover:bg-surface-alt/50 transition-colors'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-text">Privacy Settings</h3>
            <p className="text-sm text-text-soft">
              {enabledCount} categories enabled
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-text-soft" />
        ) : (
          <ChevronDown className="w-5 h-5 text-text-soft" />
        )}
      </button>

      {/* Expanded settings */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
          {/* Warning message */}
          <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning">Private Session Mode</p>
              <p className="text-text-soft mt-1">
                The PDF will not be stored. Only sanitized text is sent for AI analysis.
                Sensitive document storage is available on iOS only.
              </p>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-sm font-medium text-text mb-3">Detection Categories</h4>
            <div className="space-y-2">
              {AUTO_DETECTED_CATEGORIES.map((category) => {
                const Icon = CATEGORY_ICONS[category];
                const info = CATEGORY_INFO[category];
                const isEnabled = config.enabledCategories.has(category);

                return (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    disabled={disabled}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                      isEnabled
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-accent/50'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        isEnabled ? 'bg-accent/20' : 'bg-surface-alt'
                      )}
                    >
                      <Icon className={cn('w-4 h-4', isEnabled ? 'text-accent' : 'text-text-soft')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', isEnabled ? 'text-text' : 'text-text-soft')}>
                        {info.displayName}
                      </p>
                      <p className="text-xs text-text-soft font-mono">{info.exampleMask}</p>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                        isEnabled ? 'border-accent bg-accent' : 'border-border'
                      )}
                    >
                      {isEnabled && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom strings */}
          <div>
            <h4 className="text-sm font-medium text-text mb-3">Custom Terms to Mask</h4>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomString()}
                placeholder="Company name, person name, etc."
                disabled={disabled}
                className="flex-1 px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                onClick={addCustomString}
                disabled={disabled || !customInput.trim() || customInput.trim().length < 2}
                className="px-3 py-2 bg-accent text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {config.customStrings.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {config.customStrings.map((str) => (
                  <div
                    key={str}
                    className="flex items-center gap-1 px-2 py-1 bg-surface-alt rounded-lg border border-border"
                  >
                    <span className="text-sm text-text">{str}</span>
                    <button
                      onClick={() => removeCustomString(str)}
                      disabled={disabled}
                      className="p-0.5 hover:bg-surface rounded transition-colors"
                    >
                      <X className="w-3 h-3 text-text-soft" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-soft">
                Add names, company names, or other sensitive terms to mask.
              </p>
            )}
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-surface-alt rounded-lg">
            <Info className="w-4 h-4 text-text-soft flex-shrink-0 mt-0.5" />
            <p className="text-xs text-text-soft">
              Sanitization happens entirely in your browser before any data is sent to the cloud.
              The original PDF is never uploaded.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
