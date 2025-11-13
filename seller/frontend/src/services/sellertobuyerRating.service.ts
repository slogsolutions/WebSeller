import axios from "axios";
const API = import.meta.env.VITE_BASE_URL;

export const sellerToBuyerRating = {
  async rateBuyer(data: any) {
    const token = localStorage.getItem("token");
    return await axios.post(`${API}/api/seller-rating/rate-buyer`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async getBuyerRating(buyerId: string) {
    const res = await fetch(`${API}/api/seller-rating/buyer-rating/${buyerId}`);
    return res.json();
  }
};
