import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiGet } from '../api/client';
import { useToast } from '../components/ToastProvider';
import './Vendors.css';

const inferTags = (name = '') => {
  const lower = name.toLowerCase();
  if (lower.includes('grocery')) return 'Groceries • Essentials';
  if (lower.includes('kitchen') || lower.includes('restaurant')) return 'Ghanaian • Local';
  return 'Food • Grocery';
};

const deriveRating = (id) => {
  const safeId = Number(id || 1);
  const rating = 4.3 + ((safeId * 11) % 7) * 0.1;
  return rating.toFixed(1);
};

const deriveReviews = (id) => {
  const safeId = Number(id || 1);
  return 100 + ((safeId * 79) % 801);
};

const deriveEta = (id) => {
  const safeId = Number(id || 1);
  const min = 15 + ((safeId * 5) % 21);
  const max = Math.min(min + 7, 35);
  return `${min}–${max} min`;
};

const deriveFee = (id) => {
  const safeId = Number(id || 1);
  return 6 + ((safeId * 3) % 10);
};

const mapVendor = (vendor) => {
  const id = vendor.id ?? 0;
  const name = vendor.name || `Vendor #${id}`;
  return {
    id,
    name,
    isOpen: vendor.is_open ?? true,
    address: vendor.address_text || 'Near you',
    whatsapp: vendor.whatsapp_number,
    coords: { lat: vendor.lat, lng: vendor.lng },
    tags: inferTags(name),
    rating: deriveRating(id),
    reviews: deriveReviews(id),
    eta: deriveEta(id),
    fee: deriveFee(id),
    promo: id % 3 === 0,
    imageUrl: vendor.image_url || `https://picsum.photos/seed/rova_vendor_${id}/900/600`,
  };
};

const Vendors = () => {
  const { toast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet('/public/vendors');
      const mapped = (data.vendors || []).map(mapVendor);
      const canFeature = mapped.length >= 4;
      const withFeatured = mapped.map((v, idx) => ({ ...v, featured: canFeature && idx < 2 }));
      setVendors(withFeatured);
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
      setError('We could not load vendors right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter((v) => (v.name || '').toLowerCase().includes(term));
  }, [vendors, search]);

  const featured = filtered.slice(0, 4);
  const skeletons = Array.from({ length: 6 }, (_, i) => i);
  const canFeature = vendors.length >= 4;

  return (
    <div className="container">
      <div className="vendorsPage">
      <div className="vendorsHeader">
        <div className="vendorsIntro">
          <div className="vendorsKicker">ROVA</div>
          <h1 className="vendorsTitle">Pick a vendor</h1>
          <p className="vendorsSubtitle">Choose a restaurant to start an order.</p>
        </div>
        <div className="searchCard vendorSearch">
          <div className="searchInputWrap">
            <svg className="searchIcon" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path d="M20 20L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors"
              className="vendorSearchInput"
            />
          </div>
          <span className="searchPill">Delivery</span>
        </div>
      </div>

      <div className="filterRow">
        <span className="filterChip active">All</span>
        <span className="filterChip">Near me</span>
        <span className="filterChip">Top rated</span>
        <span className="filterChip orange">Free delivery</span>
      </div>

      {featured.length > 0 && (
        <section className="featuredSection">
          <div className="sectionTitle">Featured picks</div>
          <div className="featuredRow">
            {featured.map((vendor) => (
              <Link key={`featured-${vendor.id}`} to={`/vendor/${vendor.id}`} className="featuredCard">
                <img
                  className="featuredImage"
                  src={vendor.imageUrl}
                  alt={vendor.name}
                  loading="lazy"
                />
                <div className="featuredOverlay" />
                <div className="featuredBadge">Top offer</div>
                <div className="featuredContent">
                  <div className="featuredTitle">{vendor.name}</div>
                  <div className="featuredMeta">{vendor.tags} • {vendor.eta}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="featuredSection">
        <div className="sectionTitle">All vendors</div>
        {loading ? (
          <div className="skeletonGrid">
            {skeletons.map((idx) => (
              <div key={idx} className="skeletonCard">
                <div className="skeleton skeletonImage" />
                <div className="skeleton skeletonLine" style={{ width: '60%' }} />
                <div className="skeleton skeletonLine" style={{ width: '80%' }} />
                <div className="skeleton skeletonLine" style={{ width: '40%', marginBottom: '16px' }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="vendorsError">
            <div className="vendorsErrorTitle">Something went wrong</div>
            <div className="vendorsErrorText">{error}</div>
            <button className="btn-primary" onClick={load}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="vendorsEmpty">No vendors found.</div>
        ) : (
          <div className="vendorGrid">
            {filtered.map((vendor) => (
              <Link
                key={vendor.id}
                to={`/vendor/${vendor.id}`}
                className={`vendorCard${vendor.featured ? ' featuredSpan' : ''}${vendor.isOpen ? '' : ' isClosed'}`}
              >
                <div className="vendorImageWrapper">
                  <img
                    className="vendorImage vendorImg"
                    src={vendor.imageUrl}
                    alt={vendor.name}
                    loading="lazy"
                  />
                  {vendor.isOpen ? (
                    vendor.promo && <div className="promoBadge">Free delivery</div>
                  ) : (
                    <div className="closedBadge">Closed</div>
                  )}
                  <div className="etaBadge">{vendor.eta}</div>
                  {vendor.featured ? <div className="featuredTag">ROVA Picks</div> : <div className="topBadge">Top rated</div>}
                  <div className="imageGradientOverlay" />
                </div>
                <div className="vendorContent">
                  <div className="vendorNameRow">
                    <h3 className="vendorName">{vendor.name}</h3>
                    {vendor.isOpen && <span className="openDot" />}
                  </div>
                  <div className="vendorTags">{vendor.tags}</div>
                  <div className="vendorAddress">{vendor.address}</div>
                  <div className="vendorMeta">
                    <span className="rating">★ {vendor.rating}</span>
                    <span className="reviews">({vendor.reviews}+)</span>
                    <span className="dot">•</span>
                    <span className="fee">GHS {vendor.fee} fee</span>
                  </div>
                  <span className="vendorCta">View menu</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
};

export default Vendors;
