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

  dispatch(e: KeyboardEvent, ctx: CommandContext): boolean {
    for (const b of this.bindings) {
      if (b.key !== e.key) continue;
      if (b.ctrlKey !== undefined && b.ctrlKey !== ctx.ctrlKey) continue;
      if (b.shiftKey !== undefined && b.shiftKey !== ctx.shiftKey) continue;
      if (b.altKey !== undefined && b.altKey !== ctx.altKey) continue;
      if (b.page !== undefined && b.page !== ctx.page) continue;
      if (b.playlistMode !== undefined && b.playlistMode !== ctx.playlistMode) continue;
      if (b.playlistFocus !== undefined && b.playlistFocus !== ctx.playlistFocus) continue;
      if (b.activePanel !== undefined && b.activePanel !== ctx.activePanel) continue;
      if (b.isInput !== undefined && b.isInput !== ctx.isInput) continue;
      if (b.activeModal !== undefined && b.activeModal !== ctx.activeModal) continue;
      if (b.isFilterInputFocused !== undefined && b.isFilterInputFocused !== ctx.isFilterInputFocused) continue;
      if (b.isAudioPlaying !== undefined && b.isAudioPlaying !== ctx.isAudioPlaying) continue;
      e.preventDefault();
      b.handler(ctx);
      return true;
    }
    return false;
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
