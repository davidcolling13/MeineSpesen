import React, { useState } from 'react';
import { useEmployees } from '../hooks/useEmployees';
import { Employee } from '../types';
import { Trash2, UserPlus, Edit2, Loader2 } from 'lucide-react';

const Employees: React.FC = () => {
  // Logic extracted to hook -> Separation of Concerns
  const { employees, loading, addOrUpdate, remove } = useEmployees();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id || !formData.firstName || !formData.lastName) return;
    
    const success = await addOrUpdate(formData as Employee);
    if (success) {
      setIsFormOpen(false);
      setFormData({});
    }
  };

  const handleEdit = (emp: Employee) => {
    setFormData(emp);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Mitarbeiter wirklich löschen?')) {
      await remove(id);
    }
  };

  if (loading && employees.length === 0) {
      return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Mitarbeiterverwaltung</h2>
        <button 
          onClick={() => { setFormData({}); setIsFormOpen(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={18} />
          <span>Neuer Mitarbeiter</span>
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 animate-fade-in">
          <h3 className="text-lg font-semibold mb-4">{formData.id && employees.some(e => e.id === formData.id) ? 'Bearbeiten' : 'Anlegen'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Personalnummer (ID)</label>
              <input 
                required 
                className="w-full border rounded p-2" 
                value={formData.id || ''} 
                onChange={e => setFormData({...formData, id: e.target.value})}
                placeholder="z.B. 1001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input 
                type="email"
                className="w-full border rounded p-2" 
                value={formData.email || ''} 
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="name@firma.de"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
              <input 
                required 
                className="w-full border rounded p-2" 
                value={formData.firstName || ''} 
                onChange={e => setFormData({...formData, firstName: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
              <input 
                required 
                className="w-full border rounded p-2" 
                value={formData.lastName || ''} 
                onChange={e => setFormData({...formData, lastName: e.target.value})}
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-4">
              <button 
                type="button" 
                onClick={() => setIsFormOpen(false)} 
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Abbrechen
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Speichern
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">PNR</th>
              <th className="p-4 font-semibold text-gray-600">Nachname</th>
              <th className="p-4 font-semibold text-gray-600">Vorname</th>
              <th className="p-4 font-semibold text-gray-600">Email</th>
              <th className="p-4 font-semibold text-gray-600 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="p-4">{emp.id}</td>
                <td className="p-4 font-medium">{emp.lastName}</td>
                <td className="p-4">{emp.firstName}</td>
                <td className="p-4 text-gray-500">{emp.email}</td>
                <td className="p-4 text-right space-x-2">
                  <button onClick={() => handleEdit(emp)} className="text-blue-600 hover:text-blue-800">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(emp.id)} className="text-red-600 hover:text-red-800">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-500">Keine Mitarbeiter angelegt.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Employees;