'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { UserPlus, Loader2, Trash2, Mail } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

const AVATAR_COLORS = ['#E07A5F','#8DB88A','#C9A84C','#9B8EC4','#7A8FA6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < (name||'').length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  admin:        { bg: 'var(--bloom-coral-bg)',  color: 'var(--bloom-coral)' },
  project_lead: { bg: 'var(--bloom-yellow-bg)', color: 'var(--bloom-yellow)' },
  developer:    { bg: 'var(--bloom-purple-bg)', color: 'var(--bloom-purple)' },
  viewer:       { bg: 'var(--bloom-green-bg)',  color: '#4a8a46' },
};

export default function MembersPage() {
  const { id } = useParams();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const myRole = members.find((m) => m.user_id === currentUser?.id)?.role;
  const isAdmin = myRole === 'admin' || myRole === 'project_lead';

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/api/projects/${id}/members`);
      setMembers(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query || query.length < 3) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await api.get(`/api/users/search?q=${query}`);
      const existingIds = new Set(members.map((m) => m.user_id));
      setSearchResults(res.data.filter((u: any) => !existingIds.has(u.id)));
    } catch (err) { console.error(err); }
    finally { setIsSearching(false); }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await api.post(`/api/projects/${id}/members`, { user_id: userId, role: 'developer' });
      setSearchQuery(''); setSearchResults([]);
      fetchMembers();
      toast.success('Member added!');
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to add member'); }
  };

  const handleAddByEmail = async () => {
    try {
      await api.post(`/api/projects/${id}/members`, { email: searchQuery, role: 'developer' });
      setSearchQuery(''); setSearchResults([]);
      fetchMembers();
      toast.success('Member added!');
    } catch (err: any) { toast.error(err.response?.data?.detail || 'User not found. They must be registered first.'); }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.put(`/api/projects/${id}/members/${userId}/role`, { role: newRole });
      fetchMembers();
    } catch (err) { console.error(err); }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    try {
      await api.delete(`/api/projects/${id}/members/${userId}`);
      fetchMembers();
      toast.success('Member removed');
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-3xl mx-auto space-y-6">

        <div>
          <h1 className="font-serif text-2xl font-bold" style={{ color: 'var(--bloom-text)' }}>Team Members</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--bloom-muted)' }}>Manage who has access to this project workspace.</p>
        </div>

        {/* Invite bar */}
        {isAdmin && (
          <div className="bloom-card p-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--bloom-text)' }}>
              <UserPlus size={16} style={{ color: 'var(--bloom-coral)' }} />
              Invite a member
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, username or email…"
                value={searchQuery}
                onChange={handleSearch}
                className="bloom-input w-full text-sm"
              />
              {isSearching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--bloom-muted)' }} />
              )}

              {/* Dropdown */}
              {(searchResults.length > 0 || (searchQuery.includes('@') && !isSearching)) && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-40 shadow-lg"
                  style={{ background: 'var(--bloom-surface)', border: '1px solid var(--bloom-border)' }}
                >
                  {searchResults.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-3 hover:bg-black/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: avatarColor(u.name || u.username || 'U') }}
                        >
                          {(u.name || u.username || 'U').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--bloom-text)' }}>{u.name || u.username}</p>
                          <p className="text-xs" style={{ color: 'var(--bloom-muted)' }}>{u.email}</p>
                        </div>
                      </div>
                      <button onClick={() => handleAddMember(u.id)} className="bloom-btn-primary text-xs py-1.5 px-3">
                        Add
                      </button>
                    </div>
                  ))}
                  {searchQuery.includes('@') && (
                    <div className="flex items-center justify-between p-3 hover:bg-black/5 transition-colors"
                      style={{ borderTop: '1px solid var(--bloom-border)' }}>
                      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--bloom-muted)' }}>
                        <Mail size={14} />
                        <span>Add exact email: <strong style={{ color: 'var(--bloom-text)' }}>{searchQuery}</strong></span>
                      </div>
                      <button onClick={handleAddByEmail} className="bloom-btn-secondary text-xs py-1.5 px-3">
                        Add by Email
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Member table */}
        <div className="bloom-card overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bloom-border)', background: 'var(--bloom-bg)' }}>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--bloom-muted)' }}>Member</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--bloom-muted)' }}>Role</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--bloom-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, i) => {
                const rs = ROLE_STYLE[member.role] || ROLE_STYLE.viewer;
                return (
                  <tr key={member.user_id} style={{ borderTop: i > 0 ? '1px solid var(--bloom-border)' : 'none' }}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                          style={{ background: avatarColor(member.user?.name || 'U') }}
                        >
                          {member.user?.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--bloom-text)' }}>
                            {member.user?.name}
                            {member.user_id === currentUser?.id && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--bloom-coral-bg)', color: 'var(--bloom-coral)' }}>
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--bloom-muted)' }}>{member.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {isAdmin && member.user_id !== currentUser?.id ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                          className="bloom-input text-sm py-1 px-2"
                          style={{ width: 'auto' }}
                        >
                          <option value="admin">Admin</option>
                          <option value="project_lead">Project Lead</option>
                          <option value="developer">Developer</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                          style={{ background: rs.bg, color: rs.color }}
                        >
                          {member.role?.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {isAdmin && member.user_id !== currentUser?.id && (
                        <button
                          onClick={() => handleRemove(member.user_id)}
                          className="p-2 rounded-lg transition-colors hover:bg-black/5"
                          style={{ color: 'var(--bloom-muted)' }}
                          title="Remove member"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
