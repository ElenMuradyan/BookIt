import { create } from "zustand";

interface BookingDraft {
  businessId: string;
  serviceId: string;
  employeeId: string;
  date: string;
  time: string;
}

interface MobileUiState {
  recentBusinessIds: string[];
  bookingDraft: BookingDraft | null;
  exploreCategory: string;
  addRecentBusiness: (businessId: string) => void;
  setBookingDraft: (draft: BookingDraft | null) => void;
  setExploreCategory: (category: string) => void;
}

export const useMobileStore = create<MobileUiState>((set) => ({
  recentBusinessIds: ["biz_aura", "biz_crown"],
  bookingDraft: null,
  exploreCategory: "all",
  addRecentBusiness: (businessId) =>
    set((prev) => ({
      recentBusinessIds: [businessId, ...prev.recentBusinessIds.filter((id) => id !== businessId)].slice(0, 6),
    })),
  setBookingDraft: (bookingDraft) => set({ bookingDraft }),
  setExploreCategory: (exploreCategory) => set({ exploreCategory }),
}));
