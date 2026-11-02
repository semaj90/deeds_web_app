/**
 * Courtroom Music Manifest V1
 * Defines allowlisted music tracks for story timeline choreography.
 */
export interface CourtroomMusicTrack {
  id: string;
  name: string;
  title: string;
  file?: string;
  licence: string;
  mood: 'neutral' | 'tense' | 'triumphant' | 'solemn' | 'silent';
  bpm?: number;
  loop: boolean;
}

export const COURTROOM_MUSIC_MANIFEST_V1 = Object.freeze({
  schema: 'atlas.courtroom-music-manifest.v1' as const,
  tracks: [
    {
      id: 'silence',
      name: 'Silence / Stop Playback',
      title: 'Silence / Stop Playback',
      licence: 'CC0-1.0',
      mood: 'silent',
      loop: false
    },
    {
      id: 'trial-opening',
      name: 'Courtroom Trial Opening',
      title: 'Courtroom Trial Opening',
      file: '/audio/trial-opening.mp3',
      licence: 'CC0-1.0',
      mood: 'neutral',
      bpm: 110,
      loop: true
    },
    {
      id: 'testimony-moderato',
      name: 'Witness Testimony (Moderato)',
      title: 'Witness Testimony (Moderato)',
      file: '/audio/testimony-moderato.mp3',
      licence: 'CC0-1.0',
      mood: 'neutral',
      bpm: 95,
      loop: true
    },
    {
      id: 'cross-examination',
      name: 'Cross-Examination (Allegro)',
      title: 'Cross-Examination (Allegro)',
      file: '/audio/cross-examination.mp3',
      licence: 'CC0-1.0',
      mood: 'tense',
      bpm: 138,
      loop: true
    },
    {
      id: 'cornered-presto',
      name: 'Cornered / Climax',
      title: 'Cornered / Climax',
      file: '/audio/cornered-presto.mp3',
      licence: 'CC0-1.0',
      mood: 'triumphant',
      bpm: 155,
      loop: true
    },
    {
      id: 'solemn-verdict',
      name: 'Verdict / Adjournment',
      title: 'Verdict / Adjournment',
      file: '/audio/solemn-verdict.mp3',
      licence: 'CC0-1.0',
      mood: 'solemn',
      bpm: 72,
      loop: false
    },
  ] as const,
});

export const COURTROOM_MUSIC_TRACK_IDS: readonly string[] = Object.freeze(
  COURTROOM_MUSIC_MANIFEST_V1.tracks.map((t) => t.id)
);

export type CourtroomMusicTrackId = (typeof COURTROOM_MUSIC_MANIFEST_V1.tracks)[number]['id'];

export function isValidMusicTrackId(id: string): id is CourtroomMusicTrackId {
  return COURTROOM_MUSIC_TRACK_IDS.includes(id);
}

export function getMusicTrackById(id: string): CourtroomMusicTrack | undefined {
  return COURTROOM_MUSIC_MANIFEST_V1.tracks.find((t) => t.id === id) as CourtroomMusicTrack | undefined;
}
