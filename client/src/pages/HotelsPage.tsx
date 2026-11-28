import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Employee, Hotel, Room } from '../types';
import { useAuth } from '../context/AuthContext';
import { HotelCardSkeleton } from '../components/SkeletonLoader';
import { GuestBookingModal } from '../components/GuestBookingModal';
import { 
  Plus, 
  PencilSimple, 
  Trash, 
  Star, 
  Bed, 
  MapPin, 
  ArrowRight,
  CircleNotch,
  Image as ImageIcon,
  UsersThree
} from '@phosphor-icons/react';

export const HotelsPage: React.FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [hotels, setHotels] = useState<(Hotel & { rooms?: Room[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [btnLoading, setBtnLoading] = useState<number | null>(null);
  const [deletingHotelId, setDeletingHotelId] = useState<number | null>(null);
  const [hotelAccess, setHotelAccess] = useState<Record<number, { memberRole: string | null; isOwner: boolean }>>({});
  const [memberHotel, setMemberHotel] = useState<Hotel | null>(null);
  const [members, setMembers] = useState<Array<{ Employee_ID: number; Member_Role: string; Full_Name: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedMemberRole, setSelectedMemberRole] = useState<'Member' | 'Manager'>('Member');
  const [membersLoading, setMembersLoading] = useState(false);
  const [savingMember, setSavingMember] = useState(false);

  // Guest Booking Modal State
  const [guestBookingModalOpen, setGuestBookingModalOpen] = useState(false);
  const [selectedHotelForBooking, setSelectedHotelForBooking] = useState<number | null>(null);

  const initialDestination = searchParams.get('destination') || '';
  const [search, setSearch] = useState(initialDestination);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [savingHotel, setSavingHotel] = useState(false);
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [formData, setFormData] = useState({
    Hotel_Name: '',
    Address: '',
    City: 'Dhaka',
    Contact_Number: '',
    Star_Rating: 5,
    Image_Url: ''
  });

  const fetchHotels = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hotels');
      const hotelList = res.data;

      // Fetch rooms for each hotel to display real Sale Rates and Room Descriptions
      const hotelsWithRooms = await Promise.all(
        hotelList.map(async (h: Hotel) => {
          try {
            const hRes = await api.get(`/hotels/${h.Hotel_ID}`);
            return { ...h, rooms: hRes.data.rooms || [] };
          } catch (e) {
            return { ...h, rooms: [] };
          }
        })
      );

      setHotels(hotelsWithRooms);
    } catch (err) {
      console.error('Failed to fetch hotels', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHotelAccess = async () => {
    if (!user || user.role === 'Guest') {
      setHotelAccess({});
      return;
    }
    try {
      const { data } = await api.get('/users/me/permissions');
      const access: Record<number, { memberRole: string | null; isOwner: boolean }> = {};
      for (const entry of data.hotelAccess || []) {
        access[Number(entry.Hotel_ID)] = {
          memberRole: entry.Member_Role,
          isOwner: Boolean(entry.Is_Owner)
        };
      }
      setHotelAccess(access);
    } catch (err) {
      console.error('Failed to load hotel permissions', err);
      setHotelAccess({});
    }
  };

  const fetchMembers = async (hotelId: number) => {
    const [memberResponse, employeeResponse] = await Promise.all([
      api.get(`/hotels/${hotelId}/members`),
      api.get('/employees')
    ]);
    setMembers(memberResponse.data.members);
    setEmployees(employeeResponse.data);
  };

  const openMembersModal = async (hotel: Hotel) => {
    setMemberHotel(hotel);
    setMembers([]);
    setMembersLoading(true);
    setSelectedEmployeeId('');
    setSelectedMemberRole('Member');
    try {
      await fetchMembers(hotel.Hotel_ID);
    } catch (err: any) {
      setMemberHotel(null);
      alert(err.response?.data?.error || 'Failed to load hotel members');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberHotel || !selectedEmployeeId) return;
    setSavingMember(true);
    try {
      await api.post(`/hotels/${memberHotel.Hotel_ID}/members`, {
        employeeId: Number(selectedEmployeeId),
        memberRole: selectedMemberRole
      });
      await fetchMembers(memberHotel.Hotel_ID);
      setSelectedEmployeeId('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add hotel member');
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (employeeId: number) => {
    if (!memberHotel || !confirm('Remove this employee from the hotel group?')) return;
    try {
      await api.delete(`/hotels/${memberHotel.Hotel_ID}/members/${employeeId}`);
      await fetchMembers(memberHotel.Hotel_ID);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to remove hotel member');
    }
  };

  useEffect(() => {
    fetchHotels();
    fetchHotelAccess();
  }, [user?.id]);

  const openCreateModal = () => {
    setEditingHotel(null);
    setFormData({
      Hotel_Name: '',
      Address: '',
      City: 'Dhaka',
      Contact_Number: '',
      Star_Rating: 5,
      Image_Url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'
    });
    setModalOpen(true);
  };

  const openEditModal = (hotel: Hotel) => {
    setEditingHotel(hotel);
    setFormData({
      Hotel_Name: hotel.Hotel_Name,
      Address: hotel.Address || '',
      City: hotel.City || 'Dhaka',
      Contact_Number: hotel.Contact_Number || '',
      Star_Rating: hotel.Star_Rating || 5,
      Image_Url: hotel.Image_Url || ''
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHotel(true);
    try {
      if (editingHotel) {
        await api.put(`/hotels/${editingHotel.Hotel_ID}`, formData);
      } else {
        await api.post('/hotels', formData);
      }
      setModalOpen(false);
      await Promise.all([fetchHotels(), fetchHotelAccess()]);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save hotel');
    } finally {
      setSavingHotel(false);
    }
  };

  const handleDelete = async (hotel: Hotel) => {
    const roomCount = Number(hotel.Total_Rooms) || 0;
    const roomNote = roomCount > 0 ? ` Its ${roomCount} room(s) will be deleted too.` : '';
    if (!confirm(`Delete "${hotel.Hotel_Name}"?${roomNote} This cannot be undone.`)) return;
    setDeletingHotelId(hotel.Hotel_ID);
    try {
      await api.delete(`/hotels/${hotel.Hotel_ID}`);
      fetchHotels();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete hotel');
    } finally {
      setDeletingHotelId(null);
    }
  };

  const handleBookClick = (hotelId: number) => {
    setBtnLoading(hotelId);
    setTimeout(() => {
      if (!token) {
        navigate(`/register?hotelId=${hotelId}`);
      } else if (user?.role === 'Guest') {
        setSelectedHotelForBooking(hotelId);
        setGuestBookingModalOpen(true);
      } else {
        navigate('/rooms');
      }
      setBtnLoading(null);
    }, 200);
  };

  const filteredHotels = hotels.filter(h => {
    return !search || search === 'All' ||
           h.Hotel_Name.toLowerCase().includes(search.toLowerCase()) ||
           (h.City && h.City.toLowerCase().includes(search.toLowerCase()));
  });

  const canCreate = user?.role === 'Admin' || user?.role === 'Manager';

  // Region options come from the hotels in the database, so newly added cities show up
  const cityOptions = Array.from(new Set(hotels.map(h => h.City).filter((c): c is string => !!c))).sort();
  if (search && !cityOptions.includes(search)) cityOptions.push(search);

  const defaultPresets = [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80'
  ];

  return (
    <div className="space-y-6 page-fade-enter max-w-5xl mx-auto">
      
      {/* Top Header & Region Search Bar */}
      <div className="bg-amber-400 p-1 rounded-xl shadow-md border-2 border-amber-500">
        <div className="bg-white dark:bg-acc-900 rounded-lg p-2 flex flex-col md:flex-row items-center gap-3">
          
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 border border-acc-200 dark:border-acc-700 rounded text-xs">
            <Bed size={16} className="text-acc-400" />
            <select
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchParams(e.target.value ? { destination: e.target.value } : {});
              }}
              className="w-full bg-transparent font-bold focus:outline-none font-mono text-acc-950 dark:text-acc-50"
            >
              <option value="">All Regions (Show All {hotels.length} Hotels)</option>
              {cityOptions.map(city => (
                <option key={city} value={city}>{city} Region</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 border border-acc-200 dark:border-acc-700 rounded text-xs font-mono">
            <span>Fri, Aug 7 — Sun, Aug 9</span>
          </div>

          <button
            onClick={fetchHotels}
            className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-acc-950 font-extrabold text-xs rounded shadow transition-all flex items-center gap-1 active:scale-95"
          >
            {loading ? <CircleNotch size={14} className="animate-spin" /> : null}
            <span>Search</span>
          </button>
        </div>
      </div>

      {/* Property Cards Container (Full Width, No Filter Sidebar) */}
      <div className="space-y-4">
        
        {/* Results Summary Bar */}
        <div className="flex justify-between items-center font-mono text-xs">
          <div>
            <h2 className="font-bold text-sm text-acc-950 dark:text-acc-50 font-sans">
              {search ? `${search}:` : 'All Locations:'} {filteredHotels.length} properties found
            </h2>
          </div>
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-acc-950 text-white dark:bg-brand-500 dark:text-acc-950 font-bold text-xs rounded shadow hover:opacity-90 transition-all"
            >
              <Plus size={14} />
              <span>Add Hotel</span>
            </button>
          )}
        </div>

        {/* Hotel Property Cards List */}
        {loading ? (
          <div className="space-y-4">
            <HotelCardSkeleton />
            <HotelCardSkeleton />
          </div>
        ) : filteredHotels.length === 0 ? (
          <div className="panel-card p-8 text-center text-xs font-mono text-acc-500 space-y-2">
            <p>No properties match your filter criteria.</p>
            <button onClick={() => setSearch('')} className="text-brand-500 underline font-bold">
              Show All Hotels
            </button>
          </div>
        ) : (
          filteredHotels.map((h, idx) => {
            const access = hotelAccess[h.Hotel_ID];
            const canEditThisHotel = access?.isOwner || access?.memberRole === 'Manager';
            const firstRoom = h.rooms && h.rooms.length > 0 ? h.rooms[0] : null;
            const originalRate = firstRoom ? Number(firstRoom.Nightly_Rate) : 0;
            const saleRate = firstRoom && firstRoom.Sale_Rate ? Number(firstRoom.Sale_Rate) : (originalRate * 0.8);
            const imgUrl = h.Image_Url || defaultPresets[idx % defaultPresets.length];
            const roomDesc = firstRoom
              ? firstRoom.Room_Description || `${firstRoom.Room_Type} Room • Air conditioning • King bed • Breakfast included`
              : 'Rooms for this property will appear here once they are added.';

            return (
              <div
                key={h.Hotel_ID}
                className="panel-card p-4 flex flex-col md:flex-row gap-4 border border-acc-200 dark:border-acc-800 hover:border-brand-500 transition-all shadow-sm group page-fade-enter"
              >
                {/* Left Hotel Photo Thumbnail */}
                <div className="w-full md:w-60 h-48 rounded overflow-hidden shrink-0 relative bg-acc-100 dark:bg-acc-800">
                  <img
                    src={imgUrl}
                    alt={h.Hotel_Name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-mono font-bold">
                    {h.City || 'Bangladesh'}
                  </span>
                </div>

                {/* Right Content & Pricing Info */}
                <div className="flex-1 flex flex-col justify-between space-y-3">
                  
                  {/* Top Row: Title & Star Rating (No Genius Badge, No Dummy Review Score) */}
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-base text-acc-950 dark:text-acc-50 group-hover:text-brand-500 transition-colors">
                          {h.Hotel_Name}
                        </h3>
                        <div className="flex text-amber-500">
                          {Array.from({ length: h.Star_Rating || 5 }).map((_, i) => (
                            <Star key={i} size={12} weight="fill" />
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-acc-500 font-mono mt-1">
                        <MapPin size={13} className="text-brand-500" />
                        <span className="font-semibold text-acc-800 dark:text-acc-200">{h.City}</span>
                        <span>• {h.Address || 'Central Location'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Room Description Box (Fetched Directly from Database) */}
                  <div className="text-xs p-3 bg-acc-50 dark:bg-acc-850 rounded border border-acc-200 dark:border-acc-800/80 font-sans space-y-1">
                    <div className="font-bold text-acc-950 dark:text-acc-100 flex justify-between items-center">
                      <span>{firstRoom ? `${firstRoom.Room_Type} Room #${firstRoom.Room_Number}` : 'No rooms listed yet'}</span>
                      {firstRoom && (
                        <span className="text-[10px] font-mono text-acc-500">Capacity: {firstRoom.Capacity} Guests</span>
                      )}
                    </div>
                    <div className="text-xs text-acc-700 dark:text-acc-300 leading-relaxed font-mono">
                      {roomDesc}
                    </div>
                  </div>

                  {/* Bottom Pricing & CTA Row (Shows Crossed-Out Regular Price & Active Sale Price) */}
                  <div className="flex justify-between items-end pt-2 border-t border-acc-100 dark:border-acc-800">
                    <div className="text-[11px] text-acc-500 font-mono">
                      {h.Total_Rooms ?? 0} Rooms Listed | Contact: {h.Contact_Number || 'N/A'}
                    </div>

                    <div className="text-right space-y-1">
                      {firstRoom && (
                        <>
                          <div className="text-[10px] text-acc-500 font-mono">2 nights stay</div>

                          {/* Crossed-out original price & BDT sale price from database */}
                          {originalRate > saleRate && (
                            <div className="text-xs text-red-500 line-through font-mono font-semibold">
                              BDT {(originalRate * 2).toLocaleString()}
                            </div>
                          )}

                          <div className="text-lg font-extrabold font-mono text-acc-950 dark:text-acc-50">
                            BDT {(saleRate * 2).toLocaleString()}
                          </div>
                        </>
                      )}

                      <div className="pt-2 flex justify-end gap-2">
                        {canEditThisHotel && (
                          <button
                            onClick={() => openEditModal(h)}
                            className="p-1.5 border border-acc-300 rounded text-xs hover:bg-acc-100"
                            title="Edit Hotel"
                          >
                            <PencilSimple size={14} />
                          </button>
                        )}
                        {access?.isOwner && (
                          <button
                            onClick={() => openMembersModal(h)}
                            className="p-1.5 border border-acc-300 rounded text-xs hover:bg-acc-100"
                            title="Manage hotel members"
                            aria-label={`Manage members for ${h.Hotel_Name}`}
                          >
                            <UsersThree size={14} />
                          </button>
                        )}
                        {access?.isOwner && (
                          <button
                            onClick={() => handleDelete(h)}
                            disabled={deletingHotelId === h.Hotel_ID}
                            className="p-1.5 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                            title="Delete Hotel"
                            aria-label={`Delete ${h.Hotel_Name}`}
                          >
                            {deletingHotelId === h.Hotel_ID ? <CircleNotch size={14} className="animate-spin" /> : <Trash size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleBookClick(h.Hotel_ID)}
                          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-acc-950 font-extrabold text-xs rounded shadow flex items-center gap-1 font-mono active:scale-95 transition-transform"
                        >
                          {btnLoading === h.Hotel_ID ? (
                            <CircleNotch size={14} className="animate-spin" />
                          ) : null}
                          <span>Check prices</span>
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit / Create Hotel Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-acc-900 border border-acc-200 dark:border-acc-700 rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-acc-950 dark:text-acc-50 border-b border-acc-100 pb-2">
              {editingHotel ? 'Edit Hotel Details' : 'Add New Hotel Branch'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Hotel Branch Name *</label>
                <input
                  type="text"
                  required
                  value={formData.Hotel_Name}
                  onChange={(e) => setFormData({ ...formData, Hotel_Name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-acc-50 border border-acc-300 rounded text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">City / Region *</label>
                  <input
                    type="text"
                    required
                    value={formData.City}
                    onChange={(e) => setFormData({ ...formData, City: e.target.value })}
                    className="w-full px-3 py-1.5 bg-acc-50 border border-acc-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Star Rating (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formData.Star_Rating}
                    onChange={(e) => setFormData({ ...formData, Star_Rating: parseInt(e.target.value) })}
                    className="w-full px-3 py-1.5 bg-acc-50 border border-acc-300 rounded text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input
                  type="text"
                  value={formData.Address}
                  onChange={(e) => setFormData({ ...formData, Address: e.target.value })}
                  className="w-full px-3 py-1.5 bg-acc-50 border border-acc-300 rounded text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Contact Phone Number</label>
                <input
                  type="text"
                  value={formData.Contact_Number}
                  onChange={(e) => setFormData({ ...formData, Contact_Number: e.target.value })}
                  className="w-full px-3 py-1.5 bg-acc-50 border border-acc-300 rounded text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                  <ImageIcon size={14} />
                  <span>Hotel Picture URL</span>
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={formData.Image_Url}
                  onChange={(e) => setFormData({ ...formData, Image_Url: e.target.value })}
                  className="w-full px-3 py-1.5 bg-acc-50 border border-acc-300 rounded text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-acc-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1.5 border text-xs rounded">Cancel</button>
                <button
                  type="submit"
                  disabled={savingHotel}
                  className="px-4 py-1.5 bg-acc-950 text-white font-bold text-xs rounded flex items-center gap-1"
                >
                  {savingHotel ? <CircleNotch size={14} className="animate-spin" /> : null}
                  <span>Save Hotel</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {memberHotel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-acc-900 border border-acc-200 dark:border-acc-700 rounded-lg max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-acc-100 dark:border-acc-800 pb-2">
              <div>
                <h3 className="text-base font-bold text-acc-950 dark:text-acc-50">Manage hotel members</h3>
                <p className="text-xs text-acc-500">{memberHotel.Hotel_Name}</p>
              </div>
              <button
                type="button"
                onClick={() => setMemberHotel(null)}
                className="px-2 py-1 border border-acc-300 rounded text-xs"
              >
                Close
              </button>
            </div>

            {membersLoading ? (
              <div className="py-6 flex justify-center"><CircleNotch size={20} className="animate-spin" /></div>
            ) : (
              <>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {members.length === 0 ? (
                    <li className="text-xs text-acc-500">No members have been added to this group.</li>
                  ) : members.map((member) => (
                    <li key={member.Employee_ID} className="flex items-center justify-between gap-2 border border-acc-200 dark:border-acc-700 rounded p-2">
                      <div>
                        <p className="text-xs font-semibold">{member.Full_Name}</p>
                        <p className="text-[11px] text-acc-500">Employee #{member.Employee_ID} · {member.Member_Role}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.Employee_ID)}
                        className="px-2 py-1 text-[11px] text-red-600 border border-red-300 rounded"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>

                <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 pt-3 border-t border-acc-100 dark:border-acc-800">
                  <select
                    required
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="px-2 py-1.5 bg-acc-50 dark:bg-acc-800 border border-acc-300 dark:border-acc-700 rounded text-xs"
                  >
                    <option value="">Select employee</option>
                    {employees
                      .filter((employee) => !members.some((member) => member.Employee_ID === employee.Employee_ID))
                      .map((employee) => (
                        <option key={employee.Employee_ID} value={employee.Employee_ID}>
                          {employee.Full_Name} (#{employee.Employee_ID})
                        </option>
                      ))}
                  </select>
                  <select
                    value={selectedMemberRole}
                    onChange={(e) => setSelectedMemberRole(e.target.value as 'Member' | 'Manager')}
                    className="px-2 py-1.5 bg-acc-50 dark:bg-acc-800 border border-acc-300 dark:border-acc-700 rounded text-xs"
                  >
                    <option value="Member">Member</option>
                    <option value="Manager">Manager</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!selectedEmployeeId || savingMember}
                    className="px-3 py-1.5 bg-acc-950 text-white dark:bg-brand-500 dark:text-acc-950 font-semibold text-xs rounded disabled:opacity-50"
                  >
                    {savingMember ? 'Adding...' : 'Add member'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Guest Room Reservation Modal */}
      <GuestBookingModal
        isOpen={guestBookingModalOpen}
        onClose={() => setGuestBookingModalOpen(false)}
        initialHotelId={selectedHotelForBooking}
        onBookingSuccess={() => navigate('/guest-dashboard')}
      />

    </div>
  );
};
