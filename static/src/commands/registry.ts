// ─── Command Registry: declarative keyboard routing ───────────────────────
// Each command module calls registry.bind({...}) with conditions.
// The first matching binding wins. No more monolithic if/else in script.ts.

import { isAudioPlaying } from '../audio.js';
import { state } from '../state.js';

export interface CommandContext {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isInput: boolean;
  page: 'sync' | 'playlist' | 'dups';
  playlistMode: boolean;
  playlistFocus: 'source' | 'sidebar';
  activePanel: 'epars' | 'source';
  activeModal: string | null;
  isFilterInputFocused: boolean;
  isAudioPlaying: boolean;
}

export type CommandHandler = (ctx: CommandContext) => void;

export interface CommandBinding {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  page?: 'sync' | 'playlist' | 'dups';
  playlistMode?: boolean;
  playlistFocus?: 'source' | 'sidebar';
  activePanel?: 'epars' | 'source';
  activeModal?: string | null;
  isInput?: boolean;
  isFilterInputFocused?: boolean;
  isAudioPlaying?: boolean;
  handler: CommandHandler;
}

class CommandRegistry {
  private bindings: CommandBinding[] = [];

  bind(binding: CommandBinding): void {
    this.bindings.push(binding);
  }

  /** Les conditions d'un binding matchent-elles le contexte ? Extrait pour
   *  la matrice de caractérisation clavier (EPIC-031). */
  bindingMatches(b: CommandBinding, ctx: CommandContext): boolean {
    if (b.key !== ctx.key) return false;
    if (b.ctrlKey !== undefined && b.ctrlKey !== ctx.ctrlKey) return false;
    if (b.shiftKey !== undefined && b.shiftKey !== ctx.shiftKey) return false;
    if (b.altKey !== undefined && b.altKey !== ctx.altKey) return false;
    if (b.page !== undefined && b.page !== ctx.page) return false;
    if (b.playlistMode !== undefined && b.playlistMode !== ctx.playlistMode) return false;
    if (b.playlistFocus !== undefined && b.playlistFocus !== ctx.playlistFocus) return false;
    if (b.activePanel !== undefined && b.activePanel !== ctx.activePanel) return false;
    if (b.isInput !== undefined && b.isInput !== ctx.isInput) return false;
    if (b.activeModal !== undefined && b.activeModal !== ctx.activeModal) return false;
    if (b.isFilterInputFocused !== undefined && b.isFilterInputFocused !== ctx.isFilterInputFocused) return false;
    if (b.isAudioPlaying !== undefined && b.isAudioPlaying !== ctx.isAudioPlaying) return false;
    return true;
  }

  dispatch(e: KeyboardEvent, ctx: CommandContext): boolean {
    for (const b of this.bindings) {
      if (!this.bindingMatches(b, ctx)) continue;
      e.preventDefault();
      b.handler(ctx);
      return true;
    }
    return false;
  }

  /** Snapshot public des bindings (légende générée, matrice clavier). */
  list(): readonly CommandBinding[] {
    return [...this.bindings];
  }
}

export const registry = new CommandRegistry();

export function buildContext(e: KeyboardEvent): CommandContext {
  const target = e.target as HTMLElement | null;
  return {
    key: e.key,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    isInput: target ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) : false,
    page: state.page,
    playlistMode: state.playlistMode,
    playlistFocus: state.playlistFocus,
    activePanel: state.activePanel,
    activeModal: state.activeModal,
    isFilterInputFocused:
      document.activeElement instanceof HTMLInputElement && document.activeElement.classList.contains('filter-input'),
    isAudioPlaying: isAudioPlaying() ?? false,
  };
}
