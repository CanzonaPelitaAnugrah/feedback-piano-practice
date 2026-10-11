export interface PianoKey {
  note: number
  label: string
  type: 'white' | 'black'
  whiteIndex?: number
  leftFromWhite?: number
}

export const KEYS: PianoKey[] = [
  { note: 60, label: 'C4', type: 'white', whiteIndex: 0 },
  { note: 61, label: 'C#4', type: 'black', leftFromWhite: 0.7 },
  { note: 62, label: 'D4', type: 'white', whiteIndex: 1 },
  { note: 63, label: 'D#4', type: 'black', leftFromWhite: 1.7 },
  { note: 64, label: 'E4', type: 'white', whiteIndex: 2 },
  { note: 65, label: 'F4', type: 'white', whiteIndex: 3 },
  { note: 66, label: 'F#4', type: 'black', leftFromWhite: 3.7 },
  { note: 67, label: 'G4', type: 'white', whiteIndex: 4 },
  { note: 68, label: 'G#4', type: 'black', leftFromWhite: 4.7 },
  { note: 69, label: 'A4', type: 'white', whiteIndex: 5 },
  { note: 70, label: 'A#4', type: 'black', leftFromWhite: 5.7 },
  { note: 71, label: 'B4', type: 'white', whiteIndex: 6 },
  { note: 72, label: 'C5', type: 'white', whiteIndex: 7 },
]
