import { createContext, useContext, useState, type ReactNode } from 'react';

interface DateRangeState {
  daysBack: number;
  setDaysBack: (days: number) => void;
}

const DateRangeContext = createContext<DateRangeState>({
  daysBack: 7,
  setDaysBack: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider intentionally
export function useDateRange() {
  return useContext(DateRangeContext);
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [daysBack, setDaysBack] = useState(7);
  return (
    <DateRangeContext.Provider value={{ daysBack, setDaysBack }}>
      {children}
    </DateRangeContext.Provider>
  );
}
