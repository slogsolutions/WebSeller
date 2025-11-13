// frontend/src/pages/Requests.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Clock3,
  CalendarDays,
  Key,
  Search,
  Filter,
  Tag,
  CreditCard,
  User,
  MapPin,
  MessageSquareText
} from 'lucide-react';
import { motion } from 'framer-motion';
import LoadingScreen from './LoadingScreen';

// ⭐ rating service + star icon
import { sellerToBuyerRating } from '../services/sellertobuyerRating.service';
import { FaStar } from 'react-icons/fa';

type StatusT =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'overdue';

interface ParkingSpaceRef {
  _id?: string;
  title?: string;
  name?: string;
  address?: any;
}

interface Booking {
  _id?: string;
  id?: string;

  // ⭐ include _id so we can fetch buyer rating
  user?: { _id?: string; name?: string };
  customerName?: string;

  startTime?: string;
  endTime?: string;
  totalPrice?: number;
  paymentStatus?: 'paid' | 'pending' | string;

  status?: StatusT;
  otpVerified?: boolean;
  providerId?: string | null;
  sessionEndAt?: string | null;
  startedAt?: string | null;

  parkingSpace?: ParkingSpaceRef;

  // flat fields from API
  parkingSpaceTitle?: string;
  parkingSpaceAddress?: string;

  // legacy fallbacks
  serviceName?: string;
  space?: ParkingSpaceRef;
  parking?: ParkingSpaceRef;

  // ⭐ track if seller already rated the buyer
  sellerRatedBuyer?: boolean;
}

type BuyerRatingSummary = Record<string, { average: number; count: number }>;

type ParkingComment = {
  _id?: string;
  comment?: string;
  score?: number;
  rating?: number; // sometimes APIs call it 'rating'
  createdAt?: string;
  fromUser?: { name?: string; _id?: string };
};

const ProviderBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // ⭐ cache of buyerId -> { average, count }
  const [buyerRatings, setBuyerRatings] = useState<BuyerRatingSummary>({});

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'accepted' | 'rejected' | 'confirmed' | 'active' | 'completed'
  >('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'specific'>('all');
  const [specificDate, setSpecificDate] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');

  // NEW: parking space dropdown selection ('' = all)
  const [parkingSelection, setParkingSelection] = useState<string>('');

  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [selectedBooking, setSelectedBooking] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState<string>('');
  const [verifyingOtp, setVerifyingOtp] = useState<string | null>(null);
  const [secondOtpInput, setSecondOtpInput] = useState('');
  const [verifyingSecondOtp, setVerifyingSecondOtp] = useState<string | null>(null);

  // ⭐ rating modal state
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingBooking, setRatingBooking] = useState<Booking | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // ⭐ NEW: parking comments modal state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [comments, setComments] = useState<ParkingComment[]>([]);
  const [commentsForTitle, setCommentsForTitle] = useState<string>('');

  // Helpers
  const getParkingTitle = (b: Booking): string => {
    return (
      b.parkingSpaceTitle ||
      b.parkingSpace?.title ||
      b.parkingSpace?.name ||
      b.space?.title ||
      b.space?.name ||
      b.parking?.title ||
      b.parking?.name ||
      b.serviceName ||
      'Parking Space'
    );
  };

  const getParkingId = (b: Booking): string | undefined =>
    b.parkingSpace?._id || b.space?._id || b.parking?._id;

  // Fetch bookings, then hydrate buyer ratings if supported
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${import.meta.env.VITE_BASE_URL}/api/booking/provider-bookings`,
          { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error('Failed to fetch bookings');

        const data = await response.json();
        const list: Booking[] = (data.bookings || data) as Booking[];

        const sorted = [...list].sort((a, b) => {
          const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
          const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
          return timeB - timeA;
        });

        setBookings(sorted);

        // hydrate unique buyers' rating summaries if your service exposes a method
        try {
          const uniqueBuyerIds = Array.from(
            new Set(sorted.map(b => b.user?._id).filter((x): x is string => Boolean(x)))
          );

          const canFetch = sellerToBuyerRating && typeof (sellerToBuyerRating as any).getBuyerRating === 'function';

          if (canFetch && uniqueBuyerIds.length) {
            const results = await Promise.allSettled(
              uniqueBuyerIds.map(async (buyerId) => {
                const summary = await (sellerToBuyerRating as any).getBuyerRating(buyerId);
                return { buyerId, summary };
              })
            );

            setBuyerRatings(prev => {
              const next = { ...prev };
              for (const r of results) {
                if (r.status === 'fulfilled') {
                  const { buyerId, summary } = r.value as any;
                  if (summary && typeof summary.average === 'number') {
                    next[buyerId] = { average: summary.average, count: summary.count ?? 0 };
                  }
                }
              }
              return next;
            });
          }
        } catch {
          // ignore rating hydration errors
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, []);

  // Build unique sorted list of parking space names for the dropdown
  const parkingOptions = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => set.add(getParkingTitle(b)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bookings]);

  // Permissions
  const canRejectBooking = (booking: Booking) => {
    if (!booking.startTime) return true;
    const startTs = new Date(booking.startTime).getTime();
    if (isNaN(startTs)) return true;
    const oneHourBefore = startTs - 60 * 60 * 1000;
    return Date.now() < oneHourBefore;
  };

  const canEnterOtp = (booking: Booking) => {
    if (!booking.startTime) return false;
    const startTs = new Date(booking.startTime).getTime();
    if (isNaN(startTs)) return false;
    return Date.now() >= startTs - 15 * 60 * 1000;
  };

  const canCancelBooking = (booking: Booking) => {
    if (!booking.startTime) return false;
    const startTs = new Date(booking.startTime).getTime();
    if (isNaN(startTs)) return false;
    return Date.now() < startTs - 24 * 60 * 60 * 1000;
  };

  // Time helpers
  const timeUntilStartText = (booking: Booking) => {
    if (!booking.startTime) return 'Start time not specified';
    const startTs = new Date(booking.startTime).getTime();
    if (isNaN(startTs)) return 'Start time invalid';
    const diff = startTs - Date.now();
    if (diff <= 0) return 'Starting now';
    const mins = Math.ceil(diff / (60 * 1000));
    if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} to start`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs} hr${hrs > 1 ? 's' : ''}${remMins ? ` ${remMins} min` : ''} to start`;
  };

  // Status ops
  const handleStatusChange = async (bookingId: any, newStatus: any) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BASE_URL}/api/booking/${bookingId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.message}`);
        return;
      }

      const data = await response.json();
      const updatedBooking = (data as any).booking || null;

      setBookings((prev) =>
        prev.map((b) =>
          (b._id || b.id) === bookingId
            ? { ...b, status: newStatus, providerId: updatedBooking?.providerId || b.providerId }
            : b
        )
      );

      alert(`Booking status updated to ${newStatus}.`);
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status.');
    }
  };

  const handleCancelBooking = (bookingId: string) => {
    const booking = bookings.find((b) => (b._id || b.id) === bookingId);
    if (!booking) return alert('Booking not found');
    if (!canCancelBooking(booking)) {
      return alert('Cannot cancel this booking online. Please contact customer care.');
    }
    handleStatusChange(bookingId, 'cancelled');
  };

  const onRejectBooking = async (bookingId: string, reason: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BASE_URL}/api/booking/${bookingId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: 'rejected', reason }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return alert(`Error: ${error.message}`);
      }

      setBookings((prev) =>
        prev.map((b) => ((b._id || b.id) === bookingId ? { ...b, status: 'rejected' } : b))
      );
    } catch (error) {
      console.error('Failed to reject booking', error);
      alert('Failed to reject booking.');
    }
  };

  // OTP ops
  const verifyOtpForBooking = async (bookingId: string) => {
    if (!otpInput.trim()) return alert('Please enter OTP');
    setVerifyingOtp(bookingId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${import.meta.env.VITE_BASE_URL}/api/booking/${bookingId}/verify-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ otp: otpInput }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'OTP verification failed');
        setVerifyingOtp(null);
        return;
      }

      const returned = (data as any).booking || (data as any);
      setBookings((prev) =>
        prev.map((b) =>
          (b._id || b.id) === bookingId
            ? {
              ...b,
              status: 'confirmed',
              otpVerified: true,
              startedAt: returned?.startedAt || new Date().toISOString(),
              sessionEndAt: returned?.sessionEndAt || null,
            }
            : b
        )
      );
      setOtpInput('');
      setVerifyingOtp(null);
      alert('OTP verified — booking confirmed!');
    } catch (err) {
      console.error('verify OTP error', err);
      alert('Error verifying OTP');
      setVerifyingOtp(null);
    }
  };

  const verifySecondOtpForBooking = async (bookingId: string) => {
    if (!secondOtpInput.trim() || secondOtpInput.length !== 6) {
      return alert('Please enter a valid 6-digit second OTP');
    }
    setVerifyingSecondOtp(bookingId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${import.meta.env.VITE_BASE_URL}/api/booking/${bookingId}/verify-second-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ otp: secondOtpInput }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        alert(`Error: ${data.message || 'Failed to verify second OTP'}`);
        setVerifyingSecondOtp(null);
        return;
      }

      const returned = (data as any).booking || (data as any);
      setBookings((prev) =>
        prev.map((b) => ((b._id || b.id) === bookingId ? { ...b, ...(returned || {}), status: 'completed' } : b))
      );
      setSecondOtpInput('');
      setVerifyingSecondOtp(null);
      alert('Parking session completed!');
    } catch (err) {
      console.error('verifySecondOtpForBooking error:', err);
      setVerifyingSecondOtp(null);
    }
  };

  // Reject ops
  const handleReject = (bookingId: string) => {
    const booking = bookings.find((b) => (b._id || b.id) === bookingId);
    if (!booking) return alert('Booking not found.');
    if (!canRejectBooking(booking)) {
      return alert('You can only reject a booking earlier than 1 hour before the start time.');
    }
    setSelectedBooking(bookingId);
    setRejectReasons((prev) => ({ ...prev, [bookingId]: '' }));
  };

  const confirmReject = () => {
    if (!selectedBooking) return;
    const reason = (rejectReasons[selectedBooking] || '').trim();
    if (!reason) return alert('Please provide a reason before rejecting.');
    onRejectBooking(selectedBooking, reason);
    setSelectedBooking(null);
    setRejectReasons((prev) => {
      const next = { ...prev };
      delete next[selectedBooking!];
      return next;
    });
  };

  // Formatters
  const formatCompactDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      dateString: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'confirmed': return <Key className="h-4 w-4 text-blue-600" />;
      case 'active': return <Clock className="h-4 w-4 text-emerald-600" />;
      case 'completed': return <Tag className="h-4 w-4 text-gray-600" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-orange-600" />;
      default: return <Clock3 className="h-4 w-4 text-amber-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'text-green-700 bg-green-100 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700';
      case 'rejected': return 'text-red-700 bg-red-100 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700';
      case 'confirmed': return 'text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700';
      case 'completed': return 'text-gray-700 bg-gray-100 border-gray-300 dark:bg-gray-900/50 dark:text-gray-300 dark:border-gray-700';
      case 'active': return 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700';
      case 'cancelled': return 'text-orange-700 bg-orange-100 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700';
      default: return 'text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700';
    }
  };

  const getPaymentColor = (paymentStatus: string) =>
    paymentStatus === 'paid'
      ? 'text-green-700 bg-green-100 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700'
      : 'text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700';

  // Filtering
  const filterBookings = () => {
    return bookings.filter((b) => {
      const buyerName = (b.user?.name || b.customerName || '').toLowerCase();
      const service = (b.serviceName || '').toLowerCase();
      const parkingTitle = getParkingTitle(b);
      const parkingLower = parkingTitle.toLowerCase();

      const q = searchTerm.toLowerCase();
      const matchesSearch = !q || buyerName.includes(q) || service.includes(q) || parkingLower.includes(q);

      const matchesParkingDropdown = !parkingSelection || parkingTitle === parkingSelection;
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesPayment = paymentFilter === 'all' || b.paymentStatus === paymentFilter;

      let matchesDate = true;
      const bookingDate = b.startTime ? new Date(b.startTime) : null;
      const today = new Date();

      if (bookingDate) {
        if (dateFilter === 'today') {
          matchesDate = bookingDate.toDateString() === today.toDateString();
        } else if (dateFilter === 'week') {
          const weekAgo = new Date();
          weekAgo.setDate(today.getDate() - 7);
          matchesDate = bookingDate >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date();
          monthAgo.setMonth(today.getMonth() - 1);
          matchesDate = bookingDate >= monthAgo;
        } else if (dateFilter === 'specific' && specificDate) {
          matchesDate = bookingDate.toISOString().split('T')[0] === specificDate;
        }
      }

      return matchesSearch && matchesParkingDropdown && matchesStatus && matchesDate && matchesPayment;
    });
  };

  const filteredBookings = filterBookings();

  // ⭐ Fetch comments for a parking space (buyer_to_seller)
  // const fetchParkingComments = async (parkingSpaceId: string) => {
  //   setCommentsLoading(true);
  //   setCommentsError(null);
  //   setComments([]);

  //   const token = localStorage.getItem('token');

  //   // Try a few common endpoints so you can wire the one you actually use:
  //   const endpoints = [
  //     `${import.meta.env.VITE_BASE_URL}/api/ratings/parking-space/${parkingSpaceId}/comments`,
  //     `${import.meta.env.VITE_BASE_URL}/api/ratings/comments?parkingSpace=${parkingSpaceId}&direction=buyer_to_seller`,
  //     `${import.meta.env.VITE_BASE_URL}/api/ratings/by-parking/${parkingSpaceId}`
  //   ];

  //   for (const url of endpoints) {
  //     try {
  //       const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  //       if (!res.ok) throw new Error('not ok');
  //       const data = await res.json();

  //       // normalize to array<ParkingComment>
  //       const arr: any[] =
  //         data?.comments || data?.ratings || data?.data || Array.isArray(data) ? data : [];

  //       const normalized: ParkingComment[] = (Array.isArray(arr) ? arr : []).map((r: any) => ({
  //         _id: r?._id,
  //         comment: r?.comment ?? r?.feedback ?? r?.text ?? '',
  //         score: typeof r?.score === 'number' ? r.score : (typeof r?.rating === 'number' ? r.rating : undefined),
  //         rating: r?.rating,
  //         createdAt: r?.createdAt || r?.date || r?.updatedAt,
  //         fromUser: r?.fromUser || r?.user || r?.buyer
  //       }));

  //       setComments(normalized);
  //       setCommentsLoading(false);
  //       return; // success, stop
  //     } catch (e) {
  //       // try next endpoint
  //     }
  //   }

  //   // If all endpoints failed:
  //   setCommentsLoading(false);
  //   setCommentsError('Could not load comments for this parking space.');
  // };// ⭐ Fetch comments that SELLERS gave to a BUYER
  const fetchBuyerComments = async (buyerId: string) => {
    setCommentsLoading(true);
    setCommentsError(null);
    setComments([]);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${import.meta.env.VITE_BASE_URL}/api/seller-rating/buyer-comments/${buyerId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      setComments(data || []);
    } catch (err) {
      setCommentsError("Failed to load comments.");
    } finally {
      setCommentsLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <LoadingScreen />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 mb-6"
          >
            <CalendarDays className="h-10 w-10 text-primary-500 mr-4" />
            <div className="text-left">
              <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                Parking Requests
              </h2>
              <p className="text-md text-gray-600 dark:text-gray-400 font-medium">
                Manage all your customer bookings and sessions
              </p>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-6 border-b pb-3 border-gray-100 dark:border-gray-700">
            <div className="flex items-center">
              <Filter className="h-5 w-5 text-primary-500 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Filters</h3>
            </div>
            <div className="text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-3 py-1 rounded-full">
              {filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''} shown
            </div>
          </div>

          {/* grid of filter controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* General search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by customer, service, or anything..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 shadow-inner"
              />
            </div>

            {/* NEW: Parking Space dropdown */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={parkingSelection}
                onChange={(e) => setParkingSelection(e.target.value)}
                className="w-full appearance-none pl-10 pr-8 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 shadow-inner"
              >
                <option value="">All Parking Spaces</option>
                {parkingOptions.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
              {/* simple caret */}
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</span>
            </div>

            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 shadow-inner"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="confirmed">Confirmed</option>
              <option value="active">Active (In Session)</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Date */}
            <div className="flex flex-col space-y-2 lg:space-y-0 lg:flex-row lg:space-x-2">
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value as any);
                  if (e.target.value !== 'specific') setSpecificDate('');
                }}
                className={`flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 shadow-inner ${dateFilter === 'specific' ? 'lg:w-1/2' : 'lg:w-full'
                  }`}
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
                <option value="specific">Specific Date</option>
              </select>

              {dateFilter === 'specific' && (
                <input
                  type="date"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="lg:w-1/2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 shadow-inner"
                />
              )}
            </div>

            {/* Payment */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 shadow-inner"
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending Payment</option>
            </select>
          </div>

          {/* Active Filters */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">Active Filters:</span>

            {searchTerm && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-300 border border-primary-300 dark:border-primary-700">
                Search: <b className="ml-1">{searchTerm}</b>
                <button onClick={() => setSearchTerm('')} className="ml-1.5 font-bold hover:text-primary-600 transition-colors">×</button>
              </span>
            )}

            {/* NEW chip for Parking Space dropdown */}
            {parkingSelection && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                Parking: <b className="ml-1">{parkingSelection}</b>
                <button onClick={() => setParkingSelection('')} className="ml-1.5 font-bold hover:text-emerald-700 transition-colors">×</button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                Status: <b className="ml-1">{statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}</b>
                <button onClick={() => setStatusFilter('all')} className="ml-1.5 font-bold hover:text-blue-600 transition-colors">×</button>
              </span>
            )}

            {dateFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border border-green-300 dark:border-green-700">
                Date:{' '}
                <b className="ml-1">
                  {dateFilter === 'specific' ? specificDate : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)}
                </b>
                <button
                  onClick={() => {
                    setDateFilter('all');
                    setSpecificDate('');
                  }}
                  className="ml-1.5 font-bold hover:text-green-600 transition-colors"
                >
                  ×
                </button>
              </span>
            )}

            {paymentFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                Payment: <b className="ml-1">{paymentFilter.charAt(0).toUpperCase() + paymentFilter.slice(1)}</b>
                <button onClick={() => setPaymentFilter('all')} className="ml-1.5 font-bold hover:text-purple-600 transition-colors">×</button>
              </span>
            )}

            {(searchTerm || parkingSelection || statusFilter !== 'all' || dateFilter !== 'all' || paymentFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setParkingSelection('');
                  setStatusFilter('all');
                  setDateFilter('all');
                  setSpecificDate('');
                  setPaymentFilter('all');
                }}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </motion.div>

        {/* Booking Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {filteredBookings.map((booking) => {
            const stableId = booking._id || booking.id!;
            const startDate = booking.startTime ? formatCompactDate(booking.startTime) : null;
            const endDate = booking.endTime ? formatCompactDate(booking.endTime) : null;
            const parkingTitle = getParkingTitle(booking);
            const parkingId = getParkingId(booking);

            return (
              <motion.div
                key={stableId}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="group bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-2xl border border-gray-100 dark:border-gray-700 transition-all duration-300 overflow-hidden relative flex flex-col"
              >
                {/* Status Badge */}
                <div
                  className={`absolute top-0 right-0 m-3 px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center shadow-md ${getStatusColor(
                    booking.status || 'pending'
                  )}`}
                >
                  {getStatusIcon(booking.status || 'pending')}
                  <span className="ml-1">
                    {(booking.status || 'pending').charAt(0).toUpperCase() + (booking.status || 'pending').slice(1)}
                  </span>
                </div>

                {/* Header with Buyer + Parking Space Title */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-start space-x-4">
                    <div className="p-3 bg-primary-100 dark:bg-primary-900/50 rounded-full flex-shrink-0">
                      <User className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-extrabold text-gray-900 dark:text-white truncate">
                        {booking.user?.name || booking.customerName || 'Unknown Customer'}
                      </h3>

                      {/* ⭐ Buyer rating row (if available) */}
                      {booking.user?._id && buyerRatings[booking.user._id] && (
                        <div className="flex items-center gap-1 mt-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <FaStar
                              key={n}
                              size={14}
                              className={
                                n <= Math.round(buyerRatings[booking.user!._id!].average)
                                  ? 'text-yellow-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              }
                            />
                          ))}
                          <span className="text-xs text-gray-500 ml-1">
                            {buyerRatings[booking.user._id].average} ({buyerRatings[booking.user._id].count})
                          </span>
                        </div>
                      )}

                      {/* Parking space name */}
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center">
                          <MapPin className="h-4 w-4 mr-1.5" />
                          {parkingTitle}
                        </p>

                        {/* ⭐ NEW: View Comments button (parking space) */}
                        {/* {parkingId && (
                          <button
                            onClick={async () => {
                              setCommentsForTitle(parkingTitle);
                              setCommentsOpen(true);
                              await fetchParkingComments(parkingId);
                            }}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-indigo-300 text-indigo-700 dark:text-indigo-300 dark:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                            title="View comments left by buyers for this parking space"
                          >
                            <MessageSquareText className="h-3.5 w-3.5" />
                            View comments
                          </button>
                        )} */}
                        {booking.user?._id && (
                          <button
                            onClick={async () => {
                              setCommentsForTitle(booking.user?.name || "Buyer");
                              setCommentsOpen(true);
                              await fetchBuyerComments(booking.user._id);
                            }}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-indigo-300 text-indigo-700 dark:text-indigo-300 dark:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                          >
                            <MessageSquareText className="h-3.5 w-3.5" />
                            View Buyer Comments
                          </button>
                        )}

                      </div>

                      {/* Optional: show address */}
                      {booking.parkingSpaceAddress && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {booking.parkingSpaceAddress}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main */}
                <div className="p-6 flex-grow">
                  <div className="grid grid-cols-2 gap-4 text-sm border-b border-gray-100 dark:border-gray-700 pb-4 mb-4">
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center text-primary-600 dark:text-primary-400 mb-1">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span className="font-semibold uppercase text-xs tracking-wider">Start Time</span>
                      </div>
                      {startDate ? (
                        <div className="text-gray-900 dark:text-white mt-1">
                          <div className="font-bold text-base">{startDate.time}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{startDate.dateString}</div>
                        </div>
                      ) : (
                        <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">N/A</div>
                      )}
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center text-red-600 dark:text-red-400 mb-1">
                        <Clock className="h-4 w-4 mr-2" />
                        <span className="font-semibold uppercase text-xs tracking-wider">End Time</span>
                      </div>
                      {endDate ? (
                        <div className="text-gray-900 dark:text-white mt-1">
                          <div className="font-bold text-base">{endDate.time}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{endDate.dateString}</div>
                        </div>
                      ) : (
                        <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">N/A</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl font-extrabold text-gray-900 dark:text-white">
                        ₹{booking.totalPrice ? Math.ceil(booking.totalPrice) : 'N/A'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">(Total Estimate)</span>
                    </div>
                    <div
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${getPaymentColor(
                        booking.paymentStatus || 'pending'
                      )}`}
                    >
                      <CreditCard className="h-3 w-3 mr-1" />
                      {booking.paymentStatus === 'paid' ? 'Pre-Paid' : 'Due'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-6 pt-0">
                  <div className="space-y-3">

                    {/* ⭐ Rate Buyer button appears only for completed & not-yet-rated */}
                    {booking.status === 'completed' && !booking.sellerRatedBuyer && (
                      <button
                        onClick={() => {
                          setRatingBooking(booking);
                          setRatingValue(5);
                          setRatingComment('');
                          setRatingModalOpen(true);
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-3 rounded-lg text-sm transition-colors duration-200 font-bold shadow-md shadow-indigo-500/30 flex items-center justify-center gap-2"
                      >
                        <FaStar /> Rate Buyer
                      </button>
                    )}

                    {booking.status === 'pending' && (
                      <div className="space-y-3">
                        {selectedBooking === (booking._id || booking.id) ? (
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 space-y-2">
                            <textarea
                              value={rejectReasons[booking._id || booking.id || ''] || ''}
                              onChange={(e) =>
                                setRejectReasons((prev) => ({
                                  ...prev,
                                  [booking._id || booking.id || '']: e.target.value,
                                }))
                              }
                              placeholder="Reason for rejection..."
                              className="w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none placeholder-red-400 dark:placeholder-red-300"
                              rows={2}
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={confirmReject}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2.5 rounded-lg text-sm transition-colors duration-200 font-bold shadow-md"
                              >
                                Confirm Reject
                              </button>
                              <button
                                onClick={() => setSelectedBooking(null)}
                                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200 font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleStatusChange(booking._id, 'accepted')}
                              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-3 py-3 rounded-lg text-sm transition-colors duration-200 font-bold shadow-md shadow-primary-500/30"
                            >
                              <CheckCircle className="h-4 w-4 mr-2 inline-block" /> Accept Booking
                            </button>
                            <button
                              onClick={() => setSelectedBooking(booking._id || booking.id!)}
                              className={`flex-1 px-3 py-3 rounded-lg text-sm transition-colors duration-200 font-medium shadow-md ${canRejectBooking(booking)
                                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/30'
                                  : 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                                }`}
                              title={
                                !canRejectBooking(booking)
                                  ? 'Cannot reject within 1 hour of start time'
                                  : 'Reject booking'
                              }
                              disabled={!canRejectBooking(booking)}
                            >
                              <XCircle className="h-4 w-4 mr-2 inline-block" />{' '}
                              {canRejectBooking(booking) ? 'Reject' : 'Locked'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {booking.paymentStatus === 'paid' && booking.status === 'accepted' && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-300 dark:border-blue-800 p-4 shadow-inner">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center">
                            <Key className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-2" />
                            Verify CHECK IN OTP
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            Session ID: {String(booking._id || booking.id).slice(-6)}
                          </span>
                        </div>

                        {canEnterOtp(booking) ? (
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              placeholder="Enter 6-digit OTP"
                              value={verifyingOtp === (booking._id || booking.id) ? otpInput : ''}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                                if (verifyingOtp === (booking._id || booking.id)) {
                                  setOtpInput(cleaned);
                                } else {
                                  setVerifyingOtp(booking._id || booking.id!);
                                  setOtpInput(cleaned);
                                }
                              }}
                              className="flex-1 px-4 py-2.5 border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              maxLength={6}
                            />
                            <button
                              onClick={() => verifyOtpForBooking(booking._id || booking.id!)}
                              disabled={verifyingOtp === (booking._id || booking.id) && otpInput.length !== 6}
                              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm transition-colors duration-200 font-bold shadow-md shadow-blue-500/30"
                            >
                              {verifyingOtp === (booking._id || booking.id) ? 'Verifying...' : 'Confirm Start'}
                            </button>
                          </div>
                        ) : (
                          <div className="text-center p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <Clock3 className="h-5 w-5 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                              Ready {timeUntilStartText(booking)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {(booking.status === 'confirmed' ||
                      booking.status === 'active' ||
                      booking.status === 'overdue') && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-300 dark:border-emerald-800 p-4 shadow-inner">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center">
                              <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mr-2" />
                              Verify CHECK OUT OTP
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                              {booking.startedAt ? 'Started' : 'Awaiting Start'}
                            </span>
                          </div>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              placeholder="Enter 6-digit End OTP"
                              value={verifyingSecondOtp === (booking._id || booking.id) ? secondOtpInput : ''}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                                if (verifyingSecondOtp === (booking._id || booking.id)) {
                                  setSecondOtpInput(cleaned);
                                } else {
                                  setVerifyingSecondOtp(booking._id || booking.id!);
                                  setSecondOtpInput(cleaned);
                                }
                              }}
                              className="flex-1 px-4 py-2.5 border border-emerald-300 dark:border-emerald-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              maxLength={6}
                            />
                            <button
                              onClick={() => verifySecondOtpForBooking(booking._id || booking.id!)}
                              disabled={verifyingSecondOtp === (booking._id || booking.id) && secondOtpInput.length !== 6}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm transition-colors duration-200 font-bold shadow-md shadow-emerald-500/30"
                            >
                              {verifyingSecondOtp === (booking._id || booking.id) ? 'Ending...' : 'End Session'}
                            </button>
                          </div>
                        </div>
                      )}

                    {booking.status !== 'completed' &&
                      booking.status !== 'cancelled' &&
                      booking.status !== 'pending' && (
                        <button
                          onClick={() => handleCancelBooking(booking._id || booking.id!)}
                          className={`w-full text-sm px-3 py-3 rounded-lg transition-colors duration-200 font-medium shadow-md ${canCancelBooking(booking)
                              ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-500/30'
                              : 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          title={
                            canCancelBooking(booking)
                              ? 'Cancel booking (Refund Policy Applies)'
                              : 'Cancellation window closed (within 24 hours of start)'
                          }
                          disabled={!canCancelBooking(booking)}
                        >
                          {canCancelBooking(booking) ? 'Cancel Booking' : 'Cancellation Window Closed'}
                        </button>
                      )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {filteredBookings.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mt-6 shadow-lg"
          >
            <CalendarDays className="h-16 w-16 text-primary-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No Bookings Found</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto text-md">
              {searchTerm || parkingSelection || statusFilter !== 'all' || dateFilter !== 'all' || paymentFilter !== 'all'
                ? 'Your current filters are too restrictive. Please try broadening your search criteria.'
                : "You don't have any customer booking requests at the moment. New requests will appear here instantly."}
            </p>
          </motion.div>
        )}
      </div>

      {/* ⭐ Rating Modal */}
      {ratingModalOpen && ratingBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Rate Buyer</h3>

            <div className="flex gap-1 mb-4 justify-center">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setRatingValue(n)}
                  className={n <= ratingValue ? 'text-yellow-500' : 'text-gray-400'}
                  aria-label={`Rate ${n}`}
                >
                  <FaStar size={28} />
                </button>
              ))}
            </div>

            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Write feedback (optional)"
              className="w-full border dark:border-gray-600 rounded-lg p-2 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
              rows={3}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRatingModalOpen(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!ratingBooking) return;
                  setSubmittingRating(true);
                  try {
                    await sellerToBuyerRating.rateBuyer({
                      bookingId: ratingBooking._id || ratingBooking.id!,
                      rating: ratingValue,
                      comment: ratingComment
                    });

                    setBookings(prev =>
                      prev.map(b =>
                        (b._id || b.id) === (ratingBooking._id || ratingBooking.id)
                          ? { ...b, sellerRatedBuyer: true }
                          : b
                      )
                    );

                    setRatingModalOpen(false);
                    setRatingBooking(null);
                    setRatingComment('');
                    setRatingValue(5);
                    alert('Rating submitted ✅');
                  } catch (err: any) {
                    alert(err?.response?.data?.message || 'Failed to submit rating');
                  } finally {
                    setSubmittingRating(false);
                  }
                }}
                disabled={submittingRating}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
              >
                {submittingRating ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ NEW: Parking Comments Modal */}
      {commentsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[10000]">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Feedback received <span className="text-indigo-600 dark:text-indigo-400">{commentsForTitle}</span>
              </h3>
              <button
                onClick={() => setCommentsOpen(false)}
                className="px-3 py-1 rounded-md border text-sm"
                aria-label="Close comments"
              >
                Close
              </button>
            </div>

            {commentsLoading && (
              <div className="text-center py-8 text-gray-600 dark:text-gray-300">Loading comments…</div>
            )}

            {!commentsLoading && commentsError && (
              <div className="text-center py-8 text-red-600 dark:text-red-400">{commentsError}</div>
            )}

            {!commentsLoading && !commentsError && comments.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">No comments yet.</div>
            )}

            {!commentsLoading && !commentsError && comments.length > 0 && (
              <div className="space-y-3 max-h-80 overflow-auto pr-1">
                {comments.map((c) => {
                  const stars = typeof c.score === 'number' ? c.score : (typeof c.rating === 'number' ? c.rating : 0);
                  return (
                    <div key={c._id || Math.random().toString(36)} className="p-3 border rounded-lg border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <FaStar
                              key={n}
                              size={14}
                              className={n <= Math.round(stars) ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}
                            />
                          ))}
                        </div>
                        <div className="text-xs text-gray-500">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
                        </div>
                      </div>
                      {c.comment && <p className="text-sm text-gray-800 dark:text-gray-200">{c.comment}</p>}
                      {c.fromUser?.name && (
                        <p className="text-xs mt-1 text-gray-500">by {c.fromUser.name}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderBookings;
