// pages/admin/player.tsx
import { useState, useEffect, FormEvent, useRef } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '@/../lib/firebaseConfig';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';

import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { handleAdminLogout } from '@/components/admin/AuthHandler';
import { updatePlayerData } from '@/../lib/playerUtils';
import { ROLE_ORDER, sortRolesByPriority } from '@/config/players';

import baseStyles from '@/styles/admin/base.module.css';
import playerStyles from '@/styles/admin/players.module.css';
import controlStyles from '@/styles/controls.module.css';
import formStyles from '@/styles/admin/forms.module.css';
import buttonStyles from '@/styles/admin/buttons.module.css';

interface Player {
  id: string;
  currentIgn: string;
  uuid: string;
  pastIgns: string[];
  events: string[];
  lastUpdated: Date;
  role?: string | null;
  mainAccount?: string | null;
  altAccounts?: string[];
}

interface Role {
  id: string;
  tag: string;
  color: string;
}

const initialPlayerForm: Partial<Player> = {
  currentIgn: '',
  pastIgns: [],
  events: [],
  altAccounts: []
};

export default function PlayerManagement() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerForm, setPlayerForm] = useState(initialPlayerForm);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Authentication check
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        router.replace('/admin/password');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Fetch players
  useEffect(() => {
    const playersRef = collection(db, 'players');
    const unsubscribe = onSnapshot(playersRef, (snapshot) => {
      const fetchedPlayers: Player[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Player));
      
      setPlayers(fetchedPlayers.sort((a, b) => a.currentIgn.localeCompare(b.currentIgn)));
    });

    return () => unsubscribe();
  }, []);

  // Fetch roles
  useEffect(() => {
    const rolesRef = collection(db, 'roles');
    const unsubscribe = onSnapshot(rolesRef, (snapshot) => {
      const fetchedRoles: Role[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Role));
      setRoles(fetchedRoles);
    });
  
    return () => unsubscribe();
  }, []);

  // Handle clicking outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player);
    setPlayerForm({ ...player });
    setError('');
    setSuccess('');
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPlayerForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
        // Basic validation
        if (!playerForm.currentIgn?.trim() && !playerForm.uuid?.trim()) {
            setError('Either Current IGN or UUID is required');
            return;
        }

        // Clean up the form data
        const cleanPastIgns = playerForm.pastIgns?.filter(ign => ign.trim() !== '') || [];
        const cleanAltAccounts = playerForm.altAccounts?.filter(alt => alt.trim() !== '') || [];

        // If we have a UUID but no IGN, fetch the IGN
        if (playerForm.uuid?.trim() && !playerForm.currentIgn?.trim()) {
            try {
                const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${playerForm.uuid}`);
                if (response.ok) {
                    const data = await response.json();
                    playerForm.currentIgn = data.name;
                } else {
                    setError('Invalid UUID provided');
                    return;
                }
            } catch (err) {
                setError('Failed to fetch player data from UUID');
                return;
            }
        }

        // If we have an IGN but no UUID, fetch the UUID
        if (playerForm.currentIgn?.trim() && !playerForm.uuid?.trim()) {
            try {
                const response = await fetch(`https://api.ashcon.app/mojang/v2/user/${playerForm.currentIgn.trim()}`);
                if (response.ok) {
                    const data = await response.json();
                    playerForm.uuid = data.uuid;
                } else {
                    setError('Invalid IGN provided');
                    return;
                }
            } catch (err) {
                setError('Failed to fetch player data from IGN');
                return;
            }
        }

        // Validate alt accounts
        if (cleanAltAccounts.includes(playerForm.currentIgn?.trim() || '') || 
            cleanAltAccounts.includes(playerForm.uuid?.trim() || '')) {
            setError('A player cannot be their own alt account');
            return;
        }

        // Check for duplicate alt accounts
        const uniqueAlts = [...new Set(cleanAltAccounts)];
        if (uniqueAlts.length !== cleanAltAccounts.length) {
            setError('Duplicate alt accounts are not allowed');
            return;
        }

        // If updating existing player
        if (selectedPlayer?.id) {
            const playerRef = doc(db, 'players', selectedPlayer.id);
            
            // Update the base player document first
            await updateDoc(playerRef, {
                currentIgn: playerForm.currentIgn?.trim() ?? '',
                uuid: playerForm.uuid?.trim() ?? '',
                pastIgns: cleanPastIgns,
                role: playerForm.role || null,
                lastUpdated: new Date()
            });
        }

        // Process the player and their alt accounts
        try {
            await updatePlayerData(
                playerForm.currentIgn?.trim() || '',
                playerForm.role || null,
                cleanAltAccounts
            );

            setSuccess(selectedPlayer ? 'Player updated successfully' : 'Player added successfully');

            // Reset form and selection
            setPlayerForm(initialPlayerForm);
            setSelectedPlayer(null);
        } catch (err) {
            if (err instanceof Error) {
                setError(`Failed to process alt accounts: ${err.message}`);
            } else {
                setError('Failed to process alt accounts');
            }
            return;
        }

    } catch (err) {
        console.error('Error saving player:', err);
        if (err instanceof Error) {
            setError(`Failed to save player: ${err.message}`);
        } else {
            setError('Failed to save player. Please try again.');
        }
    }
};

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const filteredPlayers = players.filter(player => 
    player.currentIgn.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.pastIgns?.some(ign => ign.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedRoles = [...roles].sort((a, b) => {
    const aIndex = ROLE_ORDER.indexOf(a.id as typeof ROLE_ORDER[number]);
    const bIndex = ROLE_ORDER.indexOf(b.id as typeof ROLE_ORDER[number]);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const handleLogout = () => handleAdminLogout(router);

  if (isLoading) return <div className={baseStyles.loading}>Loading...</div>;
  if (!isAuthenticated) return null;

  return (
    <div className={baseStyles.pageWrapper}>
      <Head>
        <title>Player Management - TNT Tag History</title>
      </Head>

      <Header>
        <div className={controlStyles.headerControls}>
          <Link href="/admin">
            <button className={controlStyles.headerButton} style={{ width: 'auto' }}>
              Dashboard
            </button>
          </Link>
          <button onClick={handleLogout} className={controlStyles.headerButton}>
            Logout
          </button>
        </div>
      </Header>
      
      <main className={baseStyles.mainContent}>
        <div className={baseStyles.editLayout}>
          {/* Players List Section */}
          <div className={baseStyles.formSection}>
            <div 
              className={baseStyles.header}
              style={{ 
                marginLeft: 'auto',
                marginRight: 'auto',
                maxWidth: '650px',
              }}
            > 
              <div className={baseStyles.title}>Players List</div>
              <button 
                type="button" 
                className={buttonStyles.addButton}
                onClick={() => {
                  setSelectedPlayer(null);
                  setPlayerForm(initialPlayerForm);
                }}
              >
                Add New Player
              </button>
            </div>
  
            <div className={playerStyles.searchContainer}>
              <input
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={handleSearchChange}
                className={playerStyles.searchInput}
              />
            </div>
  
            <div className={playerStyles.playersList}>
              {filteredPlayers.map(player => (
                <div 
                  key={player.id} 
                  className={`${playerStyles.playerItem} ${selectedPlayer?.id === player.id ? playerStyles.selected : ''}`}
                  onClick={() => handlePlayerSelect(player)}
                >
                  <div className={playerStyles.playerItemLeft}>
                    <div className={playerStyles.playerAvatar}>
                      <Image
                        src={`https://crafthead.net/avatar/${player.uuid}`}
                        alt={player.currentIgn}
                        width={32}
                        height={32}
                      />
                    </div>
                    <span>{player.currentIgn}</span>
                  </div>
                  {player.role && (
                    <div className={playerStyles.playerRole}>
                      {(() => {
                        const roleIds = player.role.split(',');
                        const primaryRoleId = sortRolesByPriority(roleIds.filter((id): id is typeof ROLE_ORDER[number] => 
                          ROLE_ORDER.includes(id as typeof ROLE_ORDER[number])
                        ))[0];
                        const role = roles.find(r => r.id === primaryRoleId);
                        if (!role) return null;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {role.tag}
                            <span 
                              className={playerStyles.roleColor}
                              style={{
                                backgroundColor: `#${role.color}`
                              }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
  
          {/* Player Form Section */}
          <div className={baseStyles.formSection}>
            <div className={baseStyles.header}>
              <div className={baseStyles.title}>
                {selectedPlayer ? 'Edit Player' : 'Add New Player'}
              </div>
            </div>
            <form onSubmit={handleSubmit} className={playerStyles.playerForm}>
              {error && (
                <div className={baseStyles.errorMessage}>
                  <span className={baseStyles.errorText}>{error}</span>
                </div>
              )}
              {success && (
                <div className={baseStyles.successMessage}>
                  <span className={baseStyles.successText}>{success}</span>
                </div>
              )}
  
              {/* Current IGN section */}
              <div className={playerStyles.formSection}>
                <label htmlFor="uuid">UUID</label>
                <input
                  id="uuid"
                  name="uuid"
                  type="text"
                  className={formStyles.input}
                  value={playerForm.uuid || ''}
                  onChange={async (e) => {
                    const uuid = e.target.value;
                    setPlayerForm(prev => ({
                      ...prev,
                      uuid
                    }));
                    
                    // If valid UUID format, fetch current IGN
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (uuidRegex.test(uuid)) {
                      try {
                        const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
                        if (response.ok) {
                          const data = await response.json();
                          setPlayerForm(prev => ({
                            ...prev,
                            currentIgn: data.name,
                            uuid: uuid
                          }));
                        }
                      } catch (error) {
                        console.error('Error fetching player data:', error);
                      }
                    }
                  }}
                  placeholder="Enter UUID"
                />
                
                <label htmlFor="currentIgn">Current IGN</label>
                <div className={playerStyles.inputWithAvatar}>
                  <input
                    id="currentIgn"
                    name="currentIgn"
                    type="text"
                    className={formStyles.input}
                    value={playerForm.currentIgn}
                    onChange={handleFormChange}
                    required
                  />
                  {playerForm.uuid && (
                    <div className={playerStyles.currentIgnAvatar}>
                      <Image
                        src={`https://crafthead.net/avatar/${playerForm.uuid}`}
                        alt={playerForm.currentIgn || 'Player avatar'}
                        width={30}
                        height={30}
                      />
                    </div>
                  )}
                </div>
              </div>
  
              {/* Past IGNs section */}
              <div className={playerStyles.formSection}>
                <label htmlFor="pastIgns">Past IGNs</label>
                <div className={playerStyles.pastIgnsList}>
                  {playerForm.pastIgns?.map((ign, index) => (
                    <div key={index} className={playerStyles.pastIgnRow}>
                      <input
                        type="text"
                        className={formStyles.input}
                        value={ign}
                        onChange={(e) => {
                          const newPastIgns = [...(playerForm.pastIgns || [])];
                          newPastIgns[index] = e.target.value;
                          setPlayerForm(prev => ({
                            ...prev,
                            pastIgns: newPastIgns
                          }));
                        }}
                      />
                      <button
                        type="button"
                        className={buttonStyles.deleteButton}
                        onClick={() => {
                          const newPastIgns = [...(playerForm.pastIgns || [])];
                          newPastIgns.splice(index, 1);
                          setPlayerForm(prev => ({
                            ...prev,
                            pastIgns: newPastIgns
                          }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={playerStyles.addIgnButton}
                    onClick={() => {
                      setPlayerForm(prev => ({
                        ...prev,
                        pastIgns: [...(prev.pastIgns || []), '']
                      }));
                    }}
                  >
                    Add Past IGN
                  </button>
                </div>
              </div>

              {/* Roles dropdown */}
              <div className={playerStyles.formSection}>
                <label>Roles</label>
                <div 
                  className={controlStyles.dropdown} 
                  ref={roleDropdownRef}
                  style={{ width: '100%' }}
                >
                  <div 
                    className={controlStyles.dropdownHeader}
                    onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  >
                    <span className={controlStyles.label}>
                      {playerForm.role ? 
                        sortRolesByPriority(playerForm.role.split(',').filter((id): id is typeof ROLE_ORDER[number] => 
                          ROLE_ORDER.includes(id as typeof ROLE_ORDER[number])
                        ))
                          .map(id => roles.find(r => r.id === id.trim())?.tag)
                          .join(', ') 
                        : 'Select roles...'
                      }
                    </span>
                  </div>
                  {isRoleDropdownOpen && (
                    <ul className={controlStyles.dropdownMenu}>
                      {sortedRoles.map((role) => (
                        <li 
                          key={role.id}
                          className={`${controlStyles.dropdownItem} ${
                            playerForm.role?.includes(role.id) ? controlStyles.selected : ''
                          }`}
                          onClick={() => {
                            const currentRoles = playerForm.role ? playerForm.role.split(',') : [];
                            let newRoles;
                            
                            if (currentRoles.includes(role.id)) {
                              newRoles = currentRoles.filter(id => id !== role.id);
                            } else {
                              newRoles = [...currentRoles, role.id];
                            }
                            
                            setPlayerForm(prev => ({
                              ...prev,
                              role: newRoles.length > 0 ? newRoles.join(',') : null
                            }));
                          }}
                        >
                          <span 
                            className={controlStyles.categoryColor} 
                            style={{ backgroundColor: `#${role.color}` }}
                          />
                          {role.tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Alt Accounts or Main Account section */}
              <div className={playerStyles.formSection}>
                {playerForm.mainAccount ? (
                  // If this is an alt account, show the main account info
                  <>
                    <label>Main Account</label>
                    <div className={playerStyles.pastIgnsList}>
                      <div className={playerStyles.pastIgnRow}>
                        {(() => {
                          const mainPlayer = players.find(p => p.uuid === playerForm.mainAccount);
                          const displayValue = mainPlayer 
                            ? `${mainPlayer.currentIgn} (${playerForm.mainAccount})`
                            : playerForm.mainAccount;

                          return (
                            <>
                              <input
                                type="text"
                                className={formStyles.input}
                                value={displayValue}
                                disabled
                                style={{ opacity: 0.7 }}
                              />
                              {mainPlayer && (
                                <div className={playerStyles.altAccountInfo}>
                                  <div 
                                    className={playerStyles.playerAvatar}
                                    style={{ 
                                      width: '30px',
                                      height: '30px'
                                    }}
                                  >
                                    <Image
                                      src={`https://crafthead.net/avatar/${mainPlayer.uuid}`}
                                      alt={mainPlayer.currentIgn}
                                      width={40}
                                      height={40}
                                    />
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                ) : (
                  // If this is a main account, show the alt accounts section
                  <>
                    <label htmlFor="altAccounts">Alt Accounts</label>
                    <div className={playerStyles.pastIgnsList}>
                      {playerForm.altAccounts?.map((account, index) => {
                        const altPlayer = players.find(p => p.uuid === account);
                        const displayValue = altPlayer ? `${altPlayer.currentIgn} (${account})` : account;

                        return (
                          <div key={index} className={playerStyles.pastIgnRow}>
                            <input
                              type="text"
                              className={formStyles.input}
                              value={displayValue}
                              onChange={(e) => {
                                const newAltAccounts = [...(playerForm.altAccounts || [])];
                                const inputValue = e.target.value;
                                
                                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                                if (uuidRegex.test(inputValue)) {
                                  newAltAccounts[index] = inputValue;
                                } else {
                                  const player = players.find(p => 
                                    p.currentIgn.toLowerCase() === inputValue.toLowerCase() ||
                                    p.pastIgns?.some(ign => ign.toLowerCase() === inputValue.toLowerCase())
                                  );
                                  if (player) {
                                    newAltAccounts[index] = player.uuid;
                                  } else {
                                    newAltAccounts[index] = inputValue;
                                  }
                                }
                                
                                setPlayerForm(prev => ({
                                  ...prev,
                                  altAccounts: newAltAccounts
                                }));
                              }}
                              placeholder="Enter IGN or UUID"
                            />
                            <div className={playerStyles.altAccountInfo}>
                              {altPlayer && (
                                <div 
                                  className={playerStyles.playerAvatar}
                                  style={{ 
                                    width: '30px',
                                    height: '30px'
                                  }}
                                >
                                  <Image
                                    src={`https://crafthead.net/avatar/${altPlayer.uuid}`}
                                    alt={altPlayer.currentIgn}
                                    width={40}
                                    height={40}
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className={buttonStyles.deleteButton}
                              onClick={() => {
                                const newAltAccounts = [...(playerForm.altAccounts || [])];
                                newAltAccounts.splice(index, 1);
                                setPlayerForm(prev => ({
                                  ...prev,
                                  altAccounts: newAltAccounts
                                }));
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        className={playerStyles.addIgnButton}
                        onClick={() => {
                          setPlayerForm(prev => ({
                            ...prev,
                            altAccounts: [...(prev.altAccounts || []), '']
                          }));
                        }}
                      >
                        Add Alt Account
                      </button>
                    </div>
                  </>
                )}
              </div>
  
              {/* Events section */}
              {selectedPlayer && (
                <div className={playerStyles.formSection}>
                  <label>Events (Read-only)</label>
                  <div className={playerStyles.eventsDisplay}>
                    {playerForm.events?.length ? 
                      playerForm.events.map((eventId, index) => (
                        <div key={index} className={playerStyles.eventLink}>
                          <Link 
                            href={`/admin/event/${eventId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {eventId}
                          </Link>
                        </div>
                      )) : 
                      'No events'
                    }
                  </div>
                </div>
              )}
  
              <div className={playerStyles.buttonGroup}>
                <button 
                  type="submit" 
                  className={buttonStyles.submitButton}
                >
                  {selectedPlayer ? 'Update Player' : 'Add Player'}
                </button>
                {selectedPlayer && (
                  <button 
                    type="button" 
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to delete this player? This action cannot be undone.')) {
                        try {
                          await deleteDoc(doc(db, 'players', selectedPlayer.id));
                          setSuccess('Player deleted successfully');
                          setPlayerForm(initialPlayerForm);
                          setSelectedPlayer(null);
                        } catch (err) {
                          console.error('Error deleting player:', err);
                          setError('Failed to delete player. Please try again.');
                        }
                      }
                    }} 
                    className={buttonStyles.deleteButton}
                  >
                    Delete Player
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}