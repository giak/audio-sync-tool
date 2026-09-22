// ─── Command Registry: declarative keyboard routing ───────────────────────
// Each command module calls registry.bind({...}) with conditions.
// The first matching binding wins. No more monolithic if/else in script.ts.

import { isAudioPlaying } from '../audio.js';
import { state } from '../state.js';
import { isContextMenuOpen } from '../ui.js';

export interface CommandContext {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isInput: boolean;
  page: 'sync' | 'playlist' | 'dups' | 'years';
  playlistMode: boolean;
  playlistFocus: 'source' | 'sidebar';
  activePanel: 'epars' | 'source';
  activeModal: string | null;
  isFilterInputFocused: boolean;
  isAudioPlaying: boolean;
  /** Menu contextuel ouvert (EPIC-031 P1 — pilier 1 de la pile Échap :
   *  le menu est un état DOM hors registry, la fermeture doit passer
   *  AVANT l'audio/modales et ne jamais s'exécuter dans un input). */
  isContextMenuOpen: boolean;
  /** Un dossier déplié est focusé (EPIC-031 P1 — pilier 2 de la pile :
   *  Échap = refermer le dossier, entre filtre et stop audio). */
  isExpandedDirFocused: boolean;
}

export type CommandHandler = (ctx: CommandContext) => void;

/** Section de la légende générée (EPIC-031 P1) — sync/playlist/dups dans la
 *  colonne « Raccourcis » de la modale, global dans la colonne transverse. */
export type LegendGroup = 'sync' | 'playlist' | 'dups' | 'years' | 'global';

export interface CommandBinding {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  page?: 'sync' | 'playlist' | 'dups' | 'years';
  playlistMode?: boolean;
  playlistFocus?: 'source' | 'sidebar';
  activePanel?: 'epars' | 'source';
  activeModal?: string | null;
  isInput?: boolean;
  isFilterInputFocused?: boolean;
  isAudioPlaying?: boolean;
  isContextMenuOpen?: boolean;
  isExpandedDirFocused?: boolean;
  handler: CommandHandler;
  /** Libellé lisible pour la légende générée (ex. "Copier → dossier focusé").
   *  Exigé par le test bijection (EPIC-031 P1) — absent = touche invisible. */
  label?: string;
  /** Section de légende (défaut : global). */
  group?: LegendGroup;
  /** Famille de légende (EPIC-042) : les bindings d'une MÊME section qui
   *  partagent cette clé sont rendus sur **une seule ligne** — leurs touches
   *  s'affichent côte à côte, le texte est celui du binding marqué
   *  `legendFamilyTitle`. Évite les feuilles de 8 lignes « Échap fermer X »
   *  qui décrivent la même touche. Le binding reste actif au clavier : la
   *  famille ne change QUE l'affichage de la légende. */
  legendFamily?: string;
  /** Binding dont le `label` sert de titre à la famille (exactement un par
   *  famille — vérifié par legend.test.ts), et dont la position donne l'ordre. */
  legendFamilyTitle?: boolean;
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
    if (b.isContextMenuOpen !== undefined && b.isContextMenuOpen !== ctx.isContextMenuOpen) return false;
    if (b.isExpandedDirFocused !== undefined && b.isExpandedDirFocused !== ctx.isExpandedDirFocused) return false;
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

/** Le « focus » de l'app est la classe .focused (focus.ts) dans le conteneur
 *  ACTIF de la page — pas document.activeElement. Renvoie l'élément focusé s'il
 *  est un dossier DÉPLIÉ (EPIC-031 P1 : pilier Échap « refermer le dossier »).
 *  Renvoie null en page dups (son focus vit dans dupsUI, jamais un .directory) —
 *  sinon un .focused périmé de sync shadowerait l'Échap-quitter-doublons. */
export function getFocusedExpandedDir(): HTMLElement | null {
  if (state.page === 'dups') return null;
  const sel = state.playlistMode
    ? state.playlistFocus === 'sidebar'
      ? '#playlist-tracks'
      : '#playlist-source-container'
    : state.activePanel === 'source'
      ? '#source-container'
      : '#epars-container';
  const el = document.querySelector(`${sel} .focused`);
  return el instanceof HTMLElement && el.classList.contains('directory') && el.classList.contains('expanded')
    ? el
    : null;
}

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
    isContextMenuOpen: isContextMenuOpen(),
    isExpandedDirFocused: getFocusedExpandedDir() !== null,
  };
}
