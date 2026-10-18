import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const ClockContext = createContext(new Date())

export function ClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
}

export const useClock = () => useContext(ClockContext)
