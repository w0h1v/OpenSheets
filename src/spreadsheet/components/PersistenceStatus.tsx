import React, { useEffect, useState } from 'react';
import { useSpreadsheetPersisted } from '../SpreadsheetContextPersisted';
import styles from './PersistenceStatus.module.css';

export const PersistenceStatus: React.FC = () => {
  const { syncStatus, save, persistenceMode } = useSpreadsheetPersisted();
  const [lastSaved, setLastSaved] = useState<string>('');
  const [showVersionDialog, setShowVersionDialog] = useState(false);

  useEffect(() => {
    if (syncStatus.lastSync) {
      const date = new Date(syncStatus.lastSync);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      
      if (diff < 60000) {
        setLastSaved('Just now');
      } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        setLastSaved(`${minutes} minute${minutes > 1 ? 's' : ''} ago`);
      } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        setLastSaved(`${hours} hour${hours > 1 ? 's' : ''} ago`);
      } else {
        setLastSaved(date.toLocaleDateString());
      }
    }
  }, [syncStatus.lastSync]);

  const getStatusIcon = () => {
    if (syncStatus.syncing) {
      return <span className={styles.syncingIcon}>⟳</span>;
    }
    if (!syncStatus.connected && persistenceMode !== 'local') {
      return <span className={styles.offlineIcon}>⚠</span>;
    }
    if (syncStatus.error) {
      return <span className={styles.errorIcon}>⚠</span>;
    }
    if (syncStatus.pendingChanges > 0) {
      return <span className={styles.pendingIcon}>●</span>;
    }
    return <span className={styles.savedIcon}>✓</span>;
  };

  const getStatusText = () => {
    if (syncStatus.syncing) {
      return 'Saving...';
    }
    if (!syncStatus.connected && persistenceMode !== 'local') {
      return 'Offline';
    }
    if (syncStatus.error) {
      return 'Error';
    }
    if (syncStatus.pendingChanges > 0) {
      return `${syncStatus.pendingChanges} pending`;
    }
    if (lastSaved) {
      return `Saved ${lastSaved}`;
    }
    return 'All changes saved';
  };

  const getModeIcon = () => {
    switch (persistenceMode) {
      case 'local':
        return '💾';
      case 'api':
        return '☁️';
      case 'hybrid':
        return '🔄';
      default:
        return '';
    }
  };

  const handleManualSave = async () => {
    try {
      const result = await save();
      if (!result.success) {
        console.error('Save failed:', result.error);
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.status}>
        {getStatusIcon()}
        <span className={styles.text}>{getStatusText()}</span>
        {syncStatus.error && (
          <span className={styles.errorTooltip} title={syncStatus.error}>
            ℹ
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.modeButton}
          title={`Storage mode: ${persistenceMode}`}
        >
          {getModeIcon()}
        </button>

        {syncStatus.pendingChanges > 0 && (
          <button
            className={styles.saveButton}
            onClick={handleManualSave}
            title="Save now"
          >
            Save
          </button>
        )}

        <button
          className={styles.versionButton}
          onClick={() => setShowVersionDialog(true)}
          title="Version history"
        >
          📋
        </button>
      </div>

      {!syncStatus.connected && persistenceMode !== 'local' && (
        <div className={styles.offlineBar}>
          <span>Working offline - changes will sync when reconnected</span>
        </div>
      )}

      {showVersionDialog && (
        <VersionHistoryDialog onClose={() => setShowVersionDialog(false)} />
      )}
    </div>
  );
};

interface VersionHistoryDialogProps {
  onClose: () => void;
}

const VersionHistoryDialog: React.FC<VersionHistoryDialogProps> = ({ onClose }) => {
  const { saveVersion, loadVersion } = useSpreadsheetPersisted();
  const [versions, setVersions] = useState<any[]>([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    // This would call the persistence manager's listVersions method
    // For now, using mock data
    setVersions([
      { id: 'v1', timestamp: Date.now() - 3600000, label: 'Before major changes' },
      { id: 'v2', timestamp: Date.now() - 86400000, label: 'Yesterday backup' },
    ]);
  };

  const handleSaveVersion = async () => {
    if (!label.trim()) return;
    
    setLoading(true);
    try {
      await saveVersion(label);
      setLabel('');
      await loadVersions();
    } catch (error) {
      console.error('Failed to save version:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadVersion = async (versionId: string) => {
    if (!confirm('Loading this version will replace current data. Continue?')) {
      return;
    }

    setLoading(true);
    try {
      await loadVersion(versionId);
      onClose();
    } catch (error) {
      console.error('Failed to load version:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.dialog}>
      <div className={styles.dialogContent}>
        <div className={styles.dialogHeader}>
          <h3>Version History</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.dialogBody}>
          <div className={styles.saveVersion}>
            <input
              type="text"
              placeholder="Version label..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={loading}
            />
            <button 
              onClick={handleSaveVersion}
              disabled={loading || !label.trim()}
            >
              Save Current Version
            </button>
          </div>

          <div className={styles.versionList}>
            {versions.map(version => (
              <div key={version.id} className={styles.versionItem}>
                <div className={styles.versionInfo}>
                  <span className={styles.versionLabel}>{version.label}</span>
                  <span className={styles.versionDate}>
                    {new Date(version.timestamp).toLocaleString()}
                  </span>
                </div>
                <button
                  className={styles.loadButton}
                  onClick={() => handleLoadVersion(version.id)}
                  disabled={loading}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};