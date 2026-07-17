import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────

interface UIStore {
  // Sidebar
  isSidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Selected date for route planner
  selectedDate: string | null
  setSelectedDate: (date: string) => void

  // Active job being edited
  activeJobId: string | null
  setActiveJobId: (id: string | null) => void

  // Global loading state for full page transitions
  isPageLoading: boolean
  setPageLoading: (loading: boolean) => void
}

// ─── Store ────────────────────────────────────────────────────

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      // Sidebar
      isSidebarOpen: true,
      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open) =>
        set({ isSidebarOpen: open }),

      // Selected date — defaults to today
      selectedDate: null as string | null,
      setSelectedDate: (date) =>
        set({ selectedDate: date }),

      // Active job
      activeJobId: null,
      setActiveJobId: (id) =>
        set({ activeJobId: id }),

      // Page loading
      isPageLoading: false,
      setPageLoading: (loading) =>
        set({ isPageLoading: loading }),
    }),
    { name: 'ui-store' }
  )
)