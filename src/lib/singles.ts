import type { StyleName } from "./composer";

/**
 * The station's released singles: radio tracks recorded with "grabar este
 * tema" and published on SoundCloud. The player loads only on request, so
 * the privacy promise (no third-party requests unless you ask) holds.
 */
export interface Single {
  title: string;
  style: StyleName;
  bpm: number;
  /** public SoundCloud page */
  url: string;
  /** replay link: the broadcast moment it was recorded from */
  moment: string;
}

export const SINGLES: Single[] = [
  {
    title: "Nave 7",
    style: "oxido",
    bpm: 134,
    url: "https://soundcloud.com/makinavaja909/nave-7",
    moment: "https://bakaluti.com/#fm=fm&t=1791161410",
  },
];

/** SoundCloud's embeddable player for a single, in the house colour. */
export function playerSrc(single: Single): string {
  const params = new URLSearchParams({
    url: single.url,
    color: "#c8ff00",
    visual: "false",
    show_comments: "true",
    show_user: "true",
    show_reposts: "false",
    hide_related: "true",
    auto_play: "false",
  });
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}
