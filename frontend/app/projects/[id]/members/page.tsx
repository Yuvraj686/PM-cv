'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Users, UserPlus, Shield, Loader2, MoreVertical, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function MembersPage() {
  const { id } = useParams();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const currentUser = useAuthStore(s => s.user);
  const myRole = members.find(m => m.user_id === currentUser?.id)?.role;
  const isAdmin = myRole === 'admin';

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/api/projects/${id}/members`);
      setMembers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [id]);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query || query.length < 3) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const res = await api.get(`/api/users/search?q=${query}`);
      // Filter out existing members
      const existingIds = new Set(members.map(m => m.user_id));
      setSearchResults(res.data.filter((u: any) => !existingIds.has(u.id)));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await api.post(`/api/projects/${id}/members`, { user_id: userId, role: 'developer' });
      setSearchQuery('');
      setSearchResults([]);
      fetchMembers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.put(`/api/projects/${id}/members/${userId}/role`, { role: newRole });
      fetchMembers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await api.delete(`/api/projects/${id}/members/${userId}`);
      fetchMembers();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>;

  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-geist tracking-tight">Team Members</h1>
          <p className="text-muted-foreground mt-1">Manage who has access to this project workspace.</p>
        </div>

        {/* Add Member Bar */}
        {(isAdmin || myRole === 'project_lead') && (
          <div className="glass-panel p-6 rounded-2xl border border-white/10 relative">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <UserPlus size={18} className="text-indigo-400" />
              Invite Member
            </h3>
            <div className="flex gap-4 relative">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={handleSearch}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-3 w-4 h-4 text-gray-400 animate-spin" />
                )}
                
                {/* Search Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute top-12 left-0 w-full bg-[#1A1D24] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
                    {searchResults.map(u => (
                      <div key={u.id} className="flex flex-col sm:flex-row items-center justify-between p-3 border-b border-white/5 hover:bg-white/5 transition-colors gap-3">
                        <div className="flex items-center space-x-3 w-full sm:w-auto overflow-hidden">
                          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                            {u.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{u.name}</p>
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleAddMember(u.id)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded w-full sm:w-auto"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Member List */}
        <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">User</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Role</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.map(member => (
                <tr key={member.user_id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-tr from-gray-700 to-gray-600 rounded-full flex items-center justify-center text-sm font-bold shadow-sm">
                        {member.user?.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2">
                          {member.user?.name}
                          {member.user_id === currentUser?.id && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">You</span>}
                        </p>
                        <p className="text-xs text-gray-500">{member.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {isAdmin && member.user_id !== currentUser?.id ? (
                      <select 
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer hover:bg-white/5 transition-colors"
                      >
                        <option value="admin">Admin</option>
                        <option value="project_lead">Project Lead</option>
                        <option value="developer">Developer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-sm">
                        {member.role === 'admin' ? <Shield size={14} className="text-amber-500" /> : <Users size={14} className="text-indigo-400" />}
                        <span className="capitalize text-gray-300">{member.role.replace('_', ' ')}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isAdmin && member.user_id !== currentUser?.id && (
                      <button 
                        onClick={() => handleRemove(member.user_id)}
                        className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
