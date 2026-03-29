import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Check, AlertCircle, Table as TableIcon } from 'lucide-react';
import { parseCSVFile, cleanAmount, cleanDate, RawCSVData } from '../utils/csvParser';
import { useStore, EventType } from '../store/useStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function BulkImportModal({ isOpen, onClose }: Props) {
  const { bulkAddEntries } = useStore();
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [csvData, setCsvData] = useState<RawCSVData | null>(null);
  const [transactionType, setTransactionType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [mapping, setMapping] = useState({
    targetName: -1,
    amount: -1,
    date: -1,
    eventType: -1,
    location: -1,
    relation: -1,
  });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const data = await parseCSVFile(file);
      setCsvData(data);
      setStep('mapping');
      setError(null);
    } catch (err: any) {
      setError(err.message || '파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  const handleMappingChange = (field: keyof typeof mapping, index: number) => {
    setMapping(prev => ({ ...prev, [field]: index }));
  };

  const handleMappingSubmit = () => {
    if (mapping.targetName === -1 || mapping.amount === -1) {
      setError('이름과 금액 열은 필수입니다.');
      return;
    }
    setStep('preview');
    setError(null);
  };

  const processRows = () => {
    if (!csvData) return [];
    
    return csvData.rows.map(row => {
      const name = mapping.targetName !== -1 ? String(row[mapping.targetName] || '').trim() : '';
      const amount = mapping.amount !== -1 ? cleanAmount(row[mapping.amount]) : 0;
      const rawDate = mapping.date !== -1 ? String(row[mapping.date] || '').trim() : '';
      const date = cleanDate(rawDate);
      
      // Basic validation
      if (!name || amount <= 0) return null;

      return {
        targetName: name,
        amount: amount,
        date: date,
        eventType: (mapping.eventType !== -1 ? String(row[mapping.eventType] || '').toLowerCase() : 'wedding') as EventType,
        location: mapping.location !== -1 ? String(row[mapping.location] || '').trim() : '기타',
        relation: mapping.relation !== -1 ? String(row[mapping.relation] || '').trim() : '지인',
        type: transactionType,
        isIncome: transactionType === 'INCOME',
        memo: '대량 불러오기',
      };
    }).filter(Boolean);
  };

  const handleImport = async () => {
    const processed = processRows();
    if (processed.length === 0) {
      setError('가져올 유효한 데이터가 없습니다.');
      return;
    }
    
    await bulkAddEntries(processed as any);
    onClose();
    reset();
  };

  const reset = () => {
    setStep('upload');
    setCsvData(null);
    setTransactionType('INCOME');
    setMapping({
      targetName: -1,
      amount: -1,
      date: -1,
      eventType: -1,
      location: -1,
      relation: -1,
    });
    setError(null);
  };

  const previewRows = processRows().slice(0, 3);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[32px] p-6 z-[110] shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">대량 불러오기</h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl flex items-center space-x-2 text-sm">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {step === 'upload' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-gray-500 ml-1">이 장부는 어떤 내역인가요?</label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setTransactionType('INCOME')}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                        transactionType === 'INCOME' 
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${transactionType === 'INCOME' ? 'bg-white' : 'bg-blue-400'}`} />
                      <span>받은 금액 (수입 / INCOME)</span>
                    </button>
                    <button
                      onClick={() => setTransactionType('EXPENSE')}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                        transactionType === 'EXPENSE' 
                          ? 'bg-red-500 text-white shadow-md shadow-red-100' 
                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${transactionType === 'EXPENSE' ? 'bg-white' : 'bg-red-400'}`} />
                      <span>낸 금액 (지출 / EXPENSE)</span>
                    </button>
                  </div>
                </div>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-3xl p-10 flex flex-col items-center justify-center space-y-4 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <div className="p-4 bg-blue-100 text-blue-600 rounded-full">
                    <Upload size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-gray-700">CSV 파일 선택</p>
                    <p className="text-xs text-gray-400 mt-1">여기를 클릭하거나 파일을 드래그하세요</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".csv" 
                    className="hidden" 
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl text-xs text-gray-500 space-y-2">
                  <p className="font-bold">💡 도움말</p>
                  <p>• 첫 번째 행은 제목(헤더)이어야 합니다.</p>
                  <p>• 이름과 금액 정보가 포함되어야 합니다.</p>
                </div>
              </div>
            )}

            {step === 'mapping' && csvData && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500">엑셀의 열과 앱의 항목을 연결해주세요.</p>
                <div className="space-y-4">
                  <MappingSelect 
                    label="이름 (필수)" 
                    value={mapping.targetName} 
                    headers={csvData.headers} 
                    onChange={(idx) => handleMappingChange('targetName', idx)} 
                  />
                  <MappingSelect 
                    label="금액 (필수)" 
                    value={mapping.amount} 
                    headers={csvData.headers} 
                    onChange={(idx) => handleMappingChange('amount', idx)} 
                  />
                  <MappingSelect 
                    label="날짜" 
                    value={mapping.date} 
                    headers={csvData.headers} 
                    onChange={(idx) => handleMappingChange('date', idx)} 
                  />
                  <MappingSelect 
                    label="장소" 
                    value={mapping.location} 
                    headers={csvData.headers} 
                    onChange={(idx) => handleMappingChange('location', idx)} 
                  />
                  <MappingSelect 
                    label="관계" 
                    value={mapping.relation} 
                    headers={csvData.headers} 
                    onChange={(idx) => handleMappingChange('relation', idx)} 
                  />
                </div>
                <button
                  onClick={handleMappingSubmit}
                  disabled={mapping.targetName === -1 || mapping.amount === -1}
                  className={`w-full py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all ${
                    mapping.targetName === -1 || mapping.amount === -1
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  연결 완료
                </button>
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-6">
                <div className="flex items-center space-x-2 text-sm font-bold text-gray-700">
                  <TableIcon size={18} className="text-blue-500" />
                  <span>데이터 미리보기 (상위 3개)</span>
                </div>
                
                <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-gray-500 text-[10px] uppercase font-bold">
                      <tr>
                        <th className="px-4 py-2 text-left">이름</th>
                        <th className="px-4 py-2 text-right">금액</th>
                        <th className="px-4 py-2 text-left">장소</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewRows.map((row: any, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-medium">{row.targetName}</td>
                          <td className={`px-4 py-3 text-right font-bold ${transactionType === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                            {transactionType === 'INCOME' ? '+' : '-'}{row.amount.toLocaleString()}원
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{row.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-blue-50 rounded-2xl flex items-start space-x-3">
                  <Check className="text-blue-600 mt-0.5" size={18} />
                  <p className="text-xs text-blue-700 leading-relaxed">
                    총 <span className="font-bold">{processRows().length}건</span>의 데이터를 가져옵니다. 
                    금액의 '원' 표시나 쉼표는 자동으로 제거되었습니다.
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setStep('mapping')}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold active:scale-95 transition-all"
                  >
                    이전으로
                  </button>
                  <button
                    onClick={handleImport}
                    className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
                  >
                    일괄 등록하기
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MappingSelect({ label, value, headers, onChange }: { label: string, value: number, headers: { name: string, index: number }[], onChange: (idx: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-500 ml-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
      >
        <option value={-1}>열 선택 안함</option>
        {headers.map((header) => (
          <option key={header.index} value={header.index}>{header.name}</option>
        ))}
      </select>
    </div>
  );
}
