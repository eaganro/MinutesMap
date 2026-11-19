import { createContext, useContext, useState } from 'react';

// Where the share button goes: a spot in the chart legend (bottom right of the chart card),
// which App renders outside Play. Kept in its own provider so filling it re-renders only the
// chart, not the whole app.
const ShareButtonSlotContext = createContext(null);
const NO_SLOT = [null, () => {}];

export function ShareButtonSlotProvider({ children }) {
  const slot = useState(null);
  return <ShareButtonSlotContext.Provider value={slot}>{children}</ShareButtonSlotContext.Provider>;
}

export function useShareButtonSlot() {
  return useContext(ShareButtonSlotContext) ?? NO_SLOT;
}

export function ShareButtonSlot({ className }) {
  const [, setSlot] = useShareButtonSlot();
  return <div className={className} ref={setSlot} />;
}
