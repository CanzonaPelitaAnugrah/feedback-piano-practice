import { useState, useEffect, useCallback } from 'react'

export interface UseMidiResult {
  pressedNotes: number[]
  error: string | null
  ready: boolean
}

export function useMidi(): UseMidiResult {
  const [access, setAccess] = useState<MIDIAccess | null>(null)
  const [pressedNotes, setPressedNotes] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setError('MIDI not supported in this browser')
      return
    }

    navigator.requestMIDIAccess().then(
      (midiAccess) => {
        setAccess(midiAccess)
        setError(null)
      },
      (err) => setError(err.message)
    )
  }, [])

  const handleMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data
    if (!data || data.length < 3) return
    const status = data[0]
    const data1 = data[1]
    const data2 = data[2]
    const isNoteOn = (status & 0xf0) === 0x90 && (data2 ?? 0) > 0
    const isNoteOff = (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && (data2 ?? 0) === 0)
    const note = data1

    setPressedNotes((prev) => {
      if (isNoteOn) return prev.includes(note) ? prev : [...prev, note]
      if (isNoteOff) return prev.filter((n) => n !== note)
      return prev
    })
  }, [])

  useEffect(() => {
    if (!access) return
    const inputs = Array.from(access.inputs.values())
    inputs.forEach((input) => {
      input.onmidimessage = handleMessage
    })
    return () => {
      inputs.forEach((input) => {
        input.onmidimessage = null
      })
    }
  }, [access, handleMessage])

  return {
    pressedNotes,
    error,
    ready: access !== null,
  }
}
