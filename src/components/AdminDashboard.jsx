import React, { useCallback, useEffect, useMemo, useState } from 'react'

const API_URL = 'https://sairna.abdulrahman-hares.com/api/v1/dashboard'

const EMPTY_FORM = {
  originId: '',
  destinationId: '',
  companyId: '',
  departureAt: '',
  arrivalAt: '',
  price: '',
  totalSeats: '40',
}

function getList(response, key) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.[key])) return response[key]
  if (Array.isArray(response?.data?.[key])) return response.data[key]
  return []
}

function getErrorMessage(data) {
  const message = data?.message || data?.error

  if (Array.isArray(message)) return message.join(' - ')
  if (typeof message === 'string') return message

  return 'حدث خطأ غير متوقع من السيرفر.'
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('ar-SY', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatTime(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleTimeString('ar-SY', {
    timeZone: 'Asia/Damascus',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('en-US')} ل.س`
}

function getDateTimeValue(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  )

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

function mapTrip(trip, cities, companies) {
  const origin = trip.origin
  const destination = trip.destination
  const company = trip.company

  const originName =
    typeof origin === 'object'
      ? origin?.name || 'غير محدد'
      : cities.find(city => city.id === Number(trip.originId))?.name ||
        origin ||
        'غير محدد'

  const destinationName =
    typeof destination === 'object'
      ? destination?.name || 'غير محدد'
      : cities.find(city => city.id === Number(trip.destinationId))?.name ||
        destination ||
        'غير محدد'

  const companyName =
    typeof company === 'object'
      ? company?.name || 'غير محددة'
      : companies.find(item => item.id === Number(trip.companyId))?.name ||
        company ||
        'غير محددة'

  return {
    ...trip,
    originName,
    destinationName,
    companyName,
    available: Number(trip.availableSeats ?? trip.totalSeats ?? 0),
    total: Number(trip.totalSeats ?? 0),
  }
}

function getTripStatus(status, available) {
  if (status === 'CANCELLED') return 'ملغاة'
  if (status === 'FULL' || available <= 0) return 'ممتلئة'
  if (status === 'AVAILABLE') return 'متاحة'

  return status || 'غير محددة'
}

function getTripStatusClass(status, available) {
  if (status === 'CANCELLED') {
    return 'bg-red-100 text-red-700'
  }

  if (status === 'AVAILABLE' && available > 0) {
    return 'bg-emerald-100 text-emerald-700'
  }

  return 'bg-amber-100 text-amber-700'
}

function getBookingStatus(status) {
  const statuses = {
    CONFIRMED: 'مؤكد',
    CANCELLED: 'ملغي',
    PENDING: 'قيد الانتظار',
    COMPLETED: 'مكتمل',
  }

  return statuses[status] || status || 'غير محدد'
}

function getBookingStatusClass(status) {
  if (status === 'CONFIRMED') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (status === 'CANCELLED') {
    return 'bg-red-100 text-red-700'
  }

  if (status === 'COMPLETED') {
    return 'bg-blue-100 text-blue-700'
  }

  return 'bg-amber-100 text-amber-700'
}

export default function AdminDashboard({ onLogout, admin }) {
  const [activeTab, setActiveTab] = useState('trips')

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('الكل')

  const [trips, setTrips] = useState([])
  const [cities, setCities] = useState([])
  const [companies, setCompanies] = useState([])
  const [bookings, setBookings] = useState([])

  const [loading, setLoading] = useState(true)
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [bookingsLoading, setBookingsLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [cancellingTripId, setCancellingTripId] = useState(null)
  const [cancellingBookingId, setCancellingBookingId] = useState(null)

  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)

  const [selectedBooking, setSelectedBooking] = useState(null)
  const [bookingDetailsLoading, setBookingDetailsLoading] = useState(false)

  const token =
    admin?.token ||
    localStorage.getItem('sairna-admin-token')

  const authHeaders = useMemo(() => ({
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  // طلبات API مع التحقق من صلاحية تسجيل الدخول
  const request = useCallback(async (path, options = {}) => {
    if (!token) {
      throw new Error('رمز الدخول غير موجود. سجّل دخول الأدمن من جديد.')
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'انتهت صلاحية الدخول أو أن رمز الأدمن غير صالح. سجّل الدخول مجدداً.'
        )
      }

      throw new Error(getErrorMessage(data))
    }

    return data
  }, [authHeaders, token])

  // تحميل المدن والشركات
  const loadReferenceData = useCallback(async () => {
    setReferenceLoading(true)

    try {
      const [citiesResponse, companiesResponse] = await Promise.all([
        request('/cities'),
        request('/companies'),
      ])

      setCities(getList(citiesResponse, 'cities'))
      setCompanies(getList(companiesResponse, 'companies'))
    } catch (error) {
      setPageError(error.message || 'تعذر تحميل المدن والشركات.')
    } finally {
      setReferenceLoading(false)
    }
  }, [request])

  // تحميل الرحلات
  const loadTrips = useCallback(async () => {
    setLoading(true)

    try {
      const response = await request('/trips')
      setTrips(getList(response, 'trips'))
    } catch (error) {
      setPageError(error.message || 'تعذر تحميل الرحلات.')
    } finally {
      setLoading(false)
    }
  }, [request])

  // تحميل الحجوزات
  const loadBookings = useCallback(async () => {
    setBookingsLoading(true)
    setPageError('')

    try {
      const response = await request('/bookings')
      setBookings(getList(response, 'bookings'))
    } catch (error) {
      setPageError(error.message || 'تعذر تحميل الحجوزات.')
    } finally {
      setBookingsLoading(false)
    }
  }, [request])

  useEffect(() => {
    loadReferenceData()
    loadTrips()
  }, [loadReferenceData, loadTrips])

  // تحميل الحجوزات عند فتح القسم
  useEffect(() => {
    if (activeTab === 'bookings') {
      loadBookings()
    }
  }, [activeTab, loadBookings])

  // الشركات النشطة فقط عند إضافة رحلة
  const activeCompanies = useMemo(
    () => companies.filter(company => company.isActive),
    [companies]
  )

  const mappedTrips = useMemo(
    () => trips.map(trip => mapTrip(trip, cities, companies)),
    [trips, cities, companies]
  )

  const activeBookings = useMemo(
    () => bookings.filter(booking => booking.status === 'CONFIRMED'),
    [bookings]
  )

  // عدد الحجوزات التي أُنشئت اليوم حسب توقيت دمشق
  const bookingsToday = useMemo(() => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Damascus',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

    return bookings.filter(booking => {
      if (!booking.createdAt) return false

      const bookingDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Damascus',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(booking.createdAt))

      return bookingDate === today
    }).length
  }, [bookings])

  // فتح نافذة إضافة رحلة
  const openAddModal = () => {
    setEditingTrip(null)

    setFormData({
      ...EMPTY_FORM,
      companyId: activeCompanies[0]
        ? String(activeCompanies[0].id)
        : '',
    })

    setPageError('')
    setSuccessMessage('')
    setShowModal(true)
  }

  // فتح نافذة تعديل رحلة
  const openEditModal = trip => {
    setEditingTrip(trip)

    setFormData({
      originId: String(trip.origin?.id || trip.originId || ''),
      destinationId: String(
        trip.destination?.id || trip.destinationId || ''
      ),
      companyId: String(
        trip.company?.id || trip.companyId || ''
      ),
      departureAt: getDateTimeValue(trip.departureAt),
      arrivalAt: getDateTimeValue(trip.arrivalAt),
      price: String(trip.price ?? ''),
      totalSeats: String(trip.totalSeats ?? '40'),
    })

    setPageError('')
    setSuccessMessage('')
    setShowModal(true)
  }

  // حفظ رحلة جديدة أو تعديل رحلة
  const handleSaveTrip = async event => {
    event.preventDefault()

    setPageError('')
    setSuccessMessage('')

    if (
      !formData.originId ||
      !formData.destinationId ||
      !formData.companyId
    ) {
      setPageError('اختَر شركة النقل ومدينتي الانطلاق والوصول.')
      return
    }

    if (formData.originId === formData.destinationId) {
      setPageError('مدينة الانطلاق والوصول يجب أن تكونا مختلفتين.')
      return
    }

    if (!formData.departureAt || !formData.arrivalAt) {
      setPageError('أدخل موعد الانطلاق والوصول.')
      return
    }

    const departure = new Date(formData.departureAt)
    const arrival = new Date(formData.arrivalAt)

    if (
      Number.isNaN(departure.getTime()) ||
      Number.isNaN(arrival.getTime()) ||
      arrival <= departure
    ) {
      setPageError('موعد الوصول يجب أن يكون بعد موعد الانطلاق.')
      return
    }

    if (
      Number(formData.price) <= 0 ||
      Number(formData.totalSeats) < 1
    ) {
      setPageError('السعر وعدد المقاعد يجب أن يكونا أكبر من صفر.')
      return
    }

    const selectedCompany = companies.find(
      company => company.id === Number(formData.companyId)
    )

    if (!selectedCompany?.isActive) {
      setPageError('لا يمكن اختيار شركة نقل غير نشطة.')
      return
    }

    const payload = {
      companyId: Number(formData.companyId),
      originId: Number(formData.originId),
      destinationId: Number(formData.destinationId),
      departureAt: departure.toISOString(),
      arrivalAt: arrival.toISOString(),
      price: Number(formData.price),
      totalSeats: Number(formData.totalSeats),
    }

    setSaving(true)

    try {
      if (editingTrip) {
        await request(`/trips/${editingTrip.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })

        setSuccessMessage('تم تعديل الرحلة بنجاح.')
      } else {
        await request('/trips', {
          method: 'POST',
          body: JSON.stringify(payload),
        })

        setSuccessMessage('تمت إضافة الرحلة بنجاح.')
      }

      setShowModal(false)
      setFormData(EMPTY_FORM)
      setEditingTrip(null)

      await loadTrips()
    } catch (error) {
      setPageError(error.message || 'تعذر حفظ الرحلة.')
    } finally {
      setSaving(false)
    }
  }

  // إلغاء الرحلة: نغيّر الحالة إلى CANCELLED ولا نحذف سجل الرحلة
  const handleCancelTrip = async trip => {
    if (trip.status === 'CANCELLED') return

    const confirmed = window.confirm(
      `هل أنت متأكد من إلغاء رحلة ${trip.originName} إلى ${trip.destinationName}؟`
    )

    if (!confirmed) return

    setPageError('')
    setSuccessMessage('')
    setCancellingTripId(trip.id)

    try {
      await request(`/trips/${trip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'CANCELLED',
        }),
      })

      setSuccessMessage('تم إلغاء الرحلة بنجاح.')
      await loadTrips()
    } catch (error) {
      setPageError(error.message || 'تعذر إلغاء الرحلة.')
    } finally {
      setCancellingTripId(null)
    }
  }

  // عرض تفاصيل الحجز
  const openBookingDetails = async booking => {
    setSelectedBooking(booking)
    setBookingDetailsLoading(true)

    try {
      const response = await request(`/bookings/${booking.id}`)

      const details =
        response?.data ??
        response?.booking ??
        response

      setSelectedBooking(details)
    } catch (error) {
      setPageError(error.message || 'تعذر تحميل تفاصيل الحجز.')
    } finally {
      setBookingDetailsLoading(false)
    }
  }

  // إلغاء حجز بعد تأكيد الأدمن
  const handleCancelBooking = async booking => {
    if (booking.status === 'CANCELLED') return

    const confirmed = window.confirm(
      `هل أنت متأكد من إلغاء الحجز ${booking.code || `#${booking.id}`}؟`
    )

    if (!confirmed) return

    setCancellingBookingId(booking.id)
    setPageError('')
    setSuccessMessage('')

    try {
      await request(`/bookings/${booking.id}/cancel`, {
        method: 'POST',
      })

      setSuccessMessage('تم إلغاء الحجز بنجاح.')

      await loadBookings()

      if (selectedBooking?.id === booking.id) {
        setSelectedBooking(current => current
          ? {
              ...current,
              status: 'CANCELLED',
              cancelledAt: new Date().toISOString(),
            }
          : current)
      }
    } catch (error) {
      setPageError(error.message || 'تعذر إلغاء الحجز.')
    } finally {
      setCancellingBookingId(null)
    }
  }

  // البحث وتصفية الرحلات
  const filteredTrips = mappedTrips.filter(trip => {
    const search = searchTerm.trim().toLowerCase()

    const matchesSearch =
      trip.originName.toLowerCase().includes(search) ||
      trip.destinationName.toLowerCase().includes(search) ||
      trip.companyName.toLowerCase().includes(search)

    const isAvailable =
      trip.status === 'AVAILABLE' && trip.available > 0

    const isFull =
      trip.status === 'FULL' || trip.available <= 0

    const isCancelled = trip.status === 'CANCELLED'

    const matchesStatus =
      statusFilter === 'الكل' ||
      (statusFilter === 'متاح' && isAvailable) ||
      (statusFilter === 'ممتلئ' && isFull && !isCancelled) ||
      (statusFilter === 'ملغاة' && isCancelled)

    return matchesSearch && matchesStatus
  })

  const availableTrips = mappedTrips.filter(
    trip =>
      trip.status === 'AVAILABLE' &&
      trip.available > 0
  ).length

  return (
    <div
      className="min-h-screen bg-gray-100 flex flex-col md:flex-row text-right font-sans"
      dir="rtl"
    >
      {/* القائمة الجانبية */}
      <aside className="w-full md:w-64 bg-white border-l border-gray-200 p-6 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-8 pb-4 border-b border-gray-100">
            <span className="w-10 h-10 rounded-xl bg-teal-600 text-white font-bold text-lg flex items-center justify-center shadow-md">
              س
            </span>

            <div>
              <h2 className="font-bold text-gray-800 text-base">
                سيرنا - Admin
              </h2>
              <span className="text-xs text-gray-400">
                إدارة حجز الرحلات
              </span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('trips')}
              className={`w-full text-right px-4 py-3 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'trips'
                  ? 'bg-teal-50 text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>إدارة الرحلات</span>
              <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-[10px]">
                {mappedTrips.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`w-full text-right px-4 py-3 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'bookings'
                  ? 'bg-teal-50 text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>الحجوزات</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">
                {activeBookings.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('companies')}
              className={`w-full text-right px-4 py-3 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'companies'
                  ? 'bg-teal-50 text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>شركات النقل</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">
                {companies.length}
              </span>
            </button>
          </nav>
        </div>

        <button
          onClick={onLogout}
          className="w-full text-center text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 py-2.5 rounded-xl transition mt-8"
        >
          تسجيل الخروج
        </button>
      </aside>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 p-6 md:p-10 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h1 className="text-xl font-black text-gray-800">
              لوحة تحكم سيرنا الرئيسية
            </h1>

            <p className="text-xs text-gray-500 mt-1">
              مرحباً بك! يمكنك إدارة الرحلات والحجوزات ومتابعة الحالة بمرونة.
            </p>
          </div>

          {activeTab === 'trips' && (
            <button
              onClick={openAddModal}
              disabled={referenceLoading || activeCompanies.length === 0}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-sm transition flex items-center gap-2 disabled:opacity-50"
            >
              <span>+</span>
              إضافة رحلة جديدة
            </button>
          )}
        </div>

        {/* رسائل التنبيه */}
        {pageError && (
          <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl text-xs font-bold">
            {pageError}
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl text-xs font-bold">
            {successMessage}
          </div>
        )}

        {/* البطاقات الإحصائية */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-medium text-gray-400 block mb-1">
              إجمالي الرحلات
            </span>
            <span className="text-2xl font-black text-gray-800">
              {mappedTrips.length}
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-medium text-gray-400 block mb-1">
              الرحلات المتاحة
            </span>
            <span className="text-2xl font-black text-emerald-600">
              {availableTrips}
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-medium text-gray-400 block mb-1">
              الحجوزات اليوم
            </span>
            <span className="text-2xl font-black text-teal-600">
              {bookingsToday}
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <span className="text-xs font-medium text-gray-400 block mb-1">
              الشركات المسجلة
            </span>
            <span className="text-2xl font-black text-gray-800">
              {companies.length}
            </span>
          </div>
        </div>

        {/* قسم الرحلات */}
        {activeTab === 'trips' && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden space-y-4 p-5">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pb-2 border-b border-gray-100">
              <input
                type="text"
                placeholder="ابحث عن رحلة (مثلاً: حلب، دمشق، الشام...)"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                className="w-full sm:w-72 text-xs p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-teal-500 bg-gray-50"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-xs text-gray-400">الحالة:</span>

                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  className="text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-teal-500 bg-gray-50"
                >
                  <option value="الكل">جميع الرحلات</option>
                  <option value="متاح">المتاحة فقط</option>
                  <option value="ممتلئ">الممتلئة فقط</option>
                  <option value="ملغاة">الرحلات الملغاة</option>
                </select>

                <button
                  onClick={loadTrips}
                  disabled={loading}
                  className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-2.5 rounded-xl disabled:opacity-50"
                >
                  تحديث
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="p-3.5">الانطلاق</th>
                    <th className="p-3.5">الوجهة</th>
                    <th className="p-3.5">شركة النقل</th>
                    <th className="p-3.5">الموعد</th>
                    <th className="p-3.5">السعر</th>
                    <th className="p-3.5">المقاعد المتاحة</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5 text-center">إجراءات</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="text-center py-8 text-gray-400">
                        جاري تحميل الرحلات...
                      </td>
                    </tr>
                  ) : filteredTrips.length > 0 ? (
                    filteredTrips.map(trip => {
                      const isCancelled = trip.status === 'CANCELLED'

                      return (
                        <tr key={trip.id} className="hover:bg-gray-50/80 transition">
                          <td className="p-3.5 font-bold text-gray-800">
                            {trip.originName}
                          </td>

                          <td className="p-3.5 font-bold text-gray-800">
                            {trip.destinationName}
                          </td>

                          <td className="p-3.5 text-gray-500">
                            {trip.companyName}
                          </td>

                          <td className="p-3.5">
                            <div>{formatDate(trip.departureAt)}</div>
                            <div className="text-gray-400 mt-1">
                              {formatTime(trip.departureAt)}
                            </div>
                          </td>

                          <td className="p-3.5 font-bold text-teal-600">
                            {formatMoney(trip.price)}
                          </td>

                          <td className="p-3.5 font-medium">
                            {trip.available} / {trip.total} مقعد
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`px-3 py-1 rounded-full text-[10px] font-bold ${getTripStatusClass(
                                trip.status,
                                trip.available
                              )}`}
                            >
                              {getTripStatus(trip.status, trip.available)}
                            </span>
                          </td>

                          <td className="p-3.5 text-center whitespace-nowrap">
                            {!isCancelled && (
                              <>
                                <button
                                  onClick={() => openEditModal(trip)}
                                  className="text-teal-600 hover:text-teal-800 font-bold text-[11px] ml-3"
                                >
                                  تعديل
                                </button>

                                <button
                                  onClick={() => handleCancelTrip(trip)}
                                  disabled={cancellingTripId === trip.id}
                                  className="text-red-500 hover:text-red-700 font-bold text-[11px] disabled:opacity-50"
                                >
                                  {cancellingTripId === trip.id
                                    ? 'جارٍ الإلغاء...'
                                    : 'إلغاء'}
                                </button>
                              </>
                            )}

                            {isCancelled && (
                              <span className="text-gray-400 text-[11px] font-bold">
                                تم إلغاء الرحلة
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="text-center py-8 text-gray-400">
                        لا توجد رحلات مطابقة للبحث.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* قسم الحجوزات */}
        {activeTab === 'bookings' && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-800 text-sm">
                  إدارة الحجوزات
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  عرض الحجوزات ومراجعة بيانات المسافرين وحالة كل حجز
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  الحجوزات المؤكدة:
                  <strong className="text-emerald-700 mr-1">
                    {activeBookings.length}
                  </strong>
                </span>

                <button
                  onClick={loadBookings}
                  disabled={bookingsLoading}
                  className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-2 rounded-xl disabled:opacity-50"
                >
                  تحديث
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="p-4">رقم الحجز</th>
                    <th className="p-4">اسم العميل</th>
                    <th className="p-4">المسار</th>
                    <th className="p-4">موعد الرحلة</th>
                    <th className="p-4">المقاعد</th>
                    <th className="p-4">المبلغ</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4 text-center">التفاصيل</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {bookingsLoading ? (
                    <tr>
                      <td colSpan="8" className="text-center py-10 text-gray-400">
                        جاري تحميل الحجوزات...
                      </td>
                    </tr>
                  ) : bookings.length > 0 ? (
                    bookings.map(booking => {
                      const trip = booking.trip || {}
                      const seats = Array.isArray(booking.seats)
                        ? booking.seats
                        : []

                      const route = `${
                        trip.origin?.name || 'غير محدد'
                      } - ${trip.destination?.name || 'غير محدد'}`

                      return (
                        <tr key={booking.id} className="hover:bg-gray-50/80 transition">
                          <td className="p-4 font-bold text-gray-800">
                            {booking.code || `#${booking.id}`}
                          </td>

                          <td className="p-4">
                            <div className="font-bold text-gray-800">
                              {booking.user?.name || 'غير محدد'}
                            </div>
                            <div className="text-gray-400 mt-1">
                              {booking.user?.email || '—'}
                            </div>
                          </td>

                          <td className="p-4">
                            <div className="font-bold">{route}</div>
                            <div className="text-gray-400 mt-1">
                              {trip.company?.name || '—'}
                            </div>
                          </td>

                          <td className="p-4">
                            <div>{formatDate(trip.departureAt)}</div>
                            <div className="text-gray-400 mt-1">
                              {formatTime(trip.departureAt)}
                            </div>
                          </td>

                          <td className="p-4">
                            {seats.length ? `${seats.length} مقعد` : '—'}
                          </td>

                          <td className="p-4 font-bold text-teal-700">
                            {formatMoney(booking.totalPrice)}
                          </td>

                          <td className="p-4">
                            <span
                              className={`px-3 py-1 rounded-full text-[10px] font-bold ${getBookingStatusClass(
                                booking.status
                              )}`}
                            >
                              {getBookingStatus(booking.status)}
                            </span>
                          </td>

                          <td className="p-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => openBookingDetails(booking)}
                              className="text-teal-700 hover:text-teal-900 font-bold ml-3"
                            >
                              عرض
                            </button>

                            {booking.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelBooking(booking)}
                                disabled={cancellingBookingId === booking.id}
                                className="text-red-500 hover:text-red-700 font-bold disabled:opacity-50"
                              >
                                {cancellingBookingId === booking.id
                                  ? 'جارٍ الإلغاء...'
                                  : 'إلغاء'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="text-center py-10 text-gray-400">
                        لا توجد حجوزات لعرضها حالياً.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* قسم الشركات */}
        {activeTab === 'companies' && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-sm">
                  شركات النقل
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  قائمة الشركات المسجلة وحالة نشاطها
                </p>
              </div>

              <button
                onClick={loadReferenceData}
                disabled={referenceLoading}
                className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-2 rounded-xl disabled:opacity-50"
              >
                تحديث
              </button>
            </div>

            {referenceLoading ? (
              <p className="text-center py-10 text-sm text-gray-400">
                جاري تحميل الشركات...
              </p>
            ) : companies.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="p-4">الشعار</th>
                      <th className="p-4">اسم الشركة</th>
                      <th className="p-4">الحالة</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {companies.map(company => (
                      <tr key={company.id} className="hover:bg-gray-50 transition">
                        <td className="p-4">
                          {company.logoUrl ? (
                            <img
                              src={company.logoUrl}
                              alt={company.name}
                              className="w-10 h-10 rounded-lg object-contain border border-gray-100 bg-white"
                              onError={event => {
                                event.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center font-bold">
                              {company.name?.charAt(0) || '؟'}
                            </div>
                          )}
                        </td>

                        <td className="p-4 font-bold text-gray-800">
                          {company.name}
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                              company.isActive
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {company.isActive ? 'نشطة' : 'غير نشطة'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-10 text-sm text-gray-400">
                لا توجد شركات لعرضها.
              </p>
            )}
          </div>
        )}

        {/* نافذة إضافة وتعديل الرحلات */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100 my-auto">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                <h3 className="font-bold text-sm text-gray-800">
                  {editingTrip
                    ? 'تعديل بيانات الرحلة'
                    : 'إضافة رحلة جديدة إلى النظام'}
                </h3>

                <button
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSaveTrip} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      مدينة الانطلاق
                    </label>

                    <select
                      required
                      value={formData.originId}
                      onChange={event =>
                        setFormData({
                          ...formData,
                          originId: event.target.value,
                        })
                      }
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none bg-white"
                    >
                      <option value="">اختَر المدينة</option>
                      {cities.map(city => (
                        <option key={city.id} value={city.id}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      جهة الوصول
                    </label>

                    <select
                      required
                      value={formData.destinationId}
                      onChange={event =>
                        setFormData({
                          ...formData,
                          destinationId: event.target.value,
                        })
                      }
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none bg-white"
                    >
                      <option value="">اختَر المدينة</option>
                      {cities.map(city => (
                        <option key={city.id} value={city.id}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    شركة النقل
                  </label>

                  <select
                    required
                    value={formData.companyId}
                    onChange={event =>
                      setFormData({
                        ...formData,
                        companyId: event.target.value,
                      })
                    }
                    className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none bg-white"
                  >
                    <option value="">اختَر شركة النقل</option>
                    {activeCompanies.map(company => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>

                  {activeCompanies.length === 0 && (
                    <p className="text-[11px] text-red-500 mt-1">
                      لا توجد شركات نشطة متاحة لإضافة رحلة.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    موعد الانطلاق
                  </label>

                  <input
                    type="datetime-local"
                    required
                    value={formData.departureAt}
                    onChange={event =>
                      setFormData({
                        ...formData,
                        departureAt: event.target.value,
                      })
                    }
                    className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    موعد الوصول
                  </label>

                  <input
                    type="datetime-local"
                    required
                    value={formData.arrivalAt}
                    onChange={event =>
                      setFormData({
                        ...formData,
                        arrivalAt: event.target.value,
                      })
                    }
                    className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      السعر (ل.س)
                    </label>

                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="مثال: 120000"
                      value={formData.price}
                      onChange={event =>
                        setFormData({
                          ...formData,
                          price: event.target.value,
                        })
                      }
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      عدد المقاعد
                    </label>

                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="مثال: 40"
                      value={formData.totalSeats}
                      onChange={event =>
                        setFormData({
                          ...formData,
                          totalSeats: event.target.value,
                        })
                      }
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      referenceLoading ||
                      activeCompanies.length === 0
                    }
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2.5 rounded-xl transition shadow-sm disabled:opacity-50"
                  >
                    {saving
                      ? 'جاري الحفظ...'
                      : editingTrip
                        ? 'حفظ التعديلات'
                        : 'حفظ الرحلة'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={saving}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2.5 rounded-xl transition"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* نافذة تفاصيل الحجز */}
        {selectedBooking && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
            onClick={() => setSelectedBooking(null)}
          >
            <div
              className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl my-auto"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                <div>
                  <h3 className="font-bold text-gray-800">
                    تفاصيل الحجز
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedBooking.code || `#${selectedBooking.id}`}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedBooking(null)}
                  className="text-gray-400 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>

              {bookingDetailsLoading ? (
                <p className="text-center py-10 text-sm text-gray-400">
                  جاري تحميل تفاصيل الحجز...
                </p>
              ) : (
                <div className="space-y-5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        اسم العميل
                      </span>
                      <strong className="text-gray-800">
                        {selectedBooking.user?.name || 'غير محدد'}
                      </strong>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        البريد الإلكتروني
                      </span>
                      <strong className="text-gray-800">
                        {selectedBooking.user?.email || '—'}
                      </strong>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        شركة النقل
                      </span>
                      <strong className="text-gray-800">
                        {selectedBooking.trip?.company?.name || '—'}
                      </strong>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        حالة الحجز
                      </span>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold ${getBookingStatusClass(
                          selectedBooking.status
                        )}`}
                      >
                        {getBookingStatus(selectedBooking.status)}
                      </span>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        الانطلاق والوصول
                      </span>
                      <strong className="text-gray-800">
                        {selectedBooking.trip?.origin?.name || '—'}
                        {' - '}
                        {selectedBooking.trip?.destination?.name || '—'}
                      </strong>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        موعد الرحلة
                      </span>
                      <strong className="text-gray-800">
                        {formatDate(selectedBooking.trip?.departureAt)}
                        {' - '}
                        {formatTime(selectedBooking.trip?.departureAt)}
                      </strong>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        المبلغ الإجمالي
                      </span>
                      <strong className="text-teal-700">
                        {formatMoney(selectedBooking.totalPrice)}
                      </strong>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <span className="text-gray-400 block mb-1">
                        تاريخ إنشاء الحجز
                      </span>
                      <strong className="text-gray-800">
                        {formatDate(selectedBooking.createdAt)}
                        {' - '}
                        {formatTime(selectedBooking.createdAt)}
                      </strong>
                    </div>
                  </div>

                  {/* المقاعد والمسافرون */}
                  <div>
                    <h4 className="font-bold text-gray-800 mb-2">
                      بيانات المقاعد والمسافرين
                    </h4>

                    {Array.isArray(selectedBooking.seats) &&
                    selectedBooking.seats.length > 0 ? (
                      <div className="overflow-x-auto border border-gray-100 rounded-xl">
                        <table className="w-full text-right">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              <th className="p-3">رقم المقعد</th>
                              <th className="p-3">اسم المسافر</th>
                              <th className="p-3">رقم الهاتف</th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-gray-100">
                            {selectedBooking.seats.map(seat => (
                              <tr key={seat.id}>
                                <td className="p-3 font-bold">
                                  {seat.seatNumber || '—'}
                                </td>
                                <td className="p-3">
                                  {seat.passengerName || '—'}
                                </td>
                                <td className="p-3">
                                  {seat.passengerPhone || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-gray-400 bg-gray-50 rounded-xl p-4">
                        لا توجد بيانات مقاعد مرفقة بهذا الحجز.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    {selectedBooking.status !== 'CANCELLED' && (
                      <button
                        onClick={() => handleCancelBooking(selectedBooking)}
                        disabled={
                          cancellingBookingId === selectedBooking.id
                        }
                        className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded-xl font-bold disabled:opacity-50"
                      >
                        {cancellingBookingId === selectedBooking.id
                          ? 'جارٍ الإلغاء...'
                          : 'إلغاء الحجز'}
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedBooking(null)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-bold"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}