import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

export default function useDepartmentWorkItems(department, user) {
  const storageKey = `rodas-system:records:${department}:${user.id || user.email}`;
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      let items = await apiRequest('/department-work-items');
      let legacyItems = [];
      let hasLegacyItems = false;
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          legacyItems = JSON.parse(saved);
          if (!Array.isArray(legacyItems)) throw new Error('Saved department records have an invalid format.');
          hasLegacyItems = true;
        }
      } catch (storageError) {
        setError(`Could not read locally saved department records: ${storageError.message}`);
      }

      if (hasLegacyItems) {
        try {
          for (const item of legacyItems) {
            await apiRequest('/department-work-items', {
              method: 'POST',
              body: {
                department,
                legacy_key: String(item.id),
                title: item.title,
                details: item.details,
                status: item.status,
              },
            });
          }
          window.localStorage.removeItem(storageKey);
          items = await apiRequest('/department-work-items');
        } catch (migrationError) {
          setError(`Saved browser records could not all be transferred yet: ${migrationError.message}`);
          items = await apiRequest('/department-work-items');
        }
      }

      setRecords(items);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [department, storageKey]);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadRecords, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadRecords]);

  const addRecord = async ({ title, details, status }) => {
    try {
      const record = await apiRequest('/department-work-items', {
        method: 'POST',
        body: { department, title, details, status },
      });
      setRecords((current) => [record, ...current]);
      setError('');
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  };

  const updateRecord = async (id, status) => {
    try {
      const record = await apiRequest(`/department-work-items/${id}`, {
        method: 'PATCH',
        body: { status },
      });
      setRecords((current) => current.map((item) => item.id === record.id ? record : item));
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deleteRecord = async (id) => {
    try {
      await apiRequest(`/department-work-items/${id}`, { method: 'DELETE' });
      setRecords((current) => current.filter((item) => item.id !== id));
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return { records, isLoading, error, loadRecords, addRecord, updateRecord, deleteRecord };
}
