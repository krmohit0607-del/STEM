import { useEffect, useState } from 'react';
import { charteringApi } from '../api/charteringApi';

export interface ValidationWarning {
  field: string;
  message: string;
  level: 'Error' | 'Warning';
}

export interface ValidationState {
  warnings: ValidationWarning[];
  hasErrors: boolean;
  isValid: boolean;
}

/**
 * Hook to validate estimation inputs.
 * Returns validation warnings and errors without blocking calculation.
 * Runs automatically when estimation inputs change.
 */
export function useEstimationValidation(estimationData: any) {
  const [validation, setValidation] = useState<ValidationState>({
    warnings: [],
    hasErrors: false,
    isValid: true
  });
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const validateInputs = async () => {
      if (!estimationData) return;
      
      setIsValidating(true);
      try {
        // Convert estimation data to JSON for validation
        const dataJson = JSON.stringify(estimationData);
        
        // Call backend validation service
        const result = await charteringApi.validateEstimate(dataJson);
        
        if (result && result.issues) {
          const errors = result.issues.filter((i) => i.level === 'Error');
          
          setValidation({
            warnings: result.issues,
            hasErrors: errors.length > 0,
            isValid: errors.length === 0
          });
        }
      } catch (error) {
        // Silently fail - validation is optional
        console.warn('Validation check failed:', error);
      } finally {
        setIsValidating(false);
      }
    };

    // Only validate if we have minimal required inputs
    if (estimationData?.cargoes?.length > 0 && estimationData?.ports?.length > 0) {
      const debounceTimer = setTimeout(validateInputs, 1500); // Debounce 1.5s
      return () => clearTimeout(debounceTimer);
    }
  }, [estimationData]);

  return { validation, isValidating };
}

/**
 * Get bunker ROB calculation with warnings for negative ROB.
 */
export async function calculateBunkerROB(dataJson: string) {
  try {
    const result = await charteringApi.calculateBunkerROB(dataJson);
    return result || null;
  } catch (error) {
    console.warn('ROB calculation failed:', error);
    return null;
  }
}

/**
 * Get detailed calculation breakdown: Distance → Speed → Days → Consumption → Cost.
 */
export async function getCalculationDetails(dataJson: string) {
  try {
    const result = await charteringApi.getCalculationDetails(dataJson);
    return result || null;
  } catch (error) {
    console.warn('Details calculation failed:', error);
    return null;
  }
}

