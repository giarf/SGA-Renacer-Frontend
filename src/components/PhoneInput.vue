<script setup lang="ts">
import { ref, computed } from 'vue';

interface Country {
    code: string;
    name: string;
    flag: string;
    dialCode: string;
}

const props = defineProps<{
    modelValue: string;
    required?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

const countries: Country[] = [
    { code: 'CL', name: 'Chile', flag: '🇨🇱', dialCode: '+56' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷', dialCode: '+54' },
    { code: 'MX', name: 'México', flag: '🇲🇽', dialCode: '+52' },
    { code: 'ES', name: 'España', flag: '🇪🇸', dialCode: '+34' },
    { code: 'PE', name: 'Perú', flag: '🇵🇪', dialCode: '+51' },
    { code: 'CO', name: 'Colombia', flag: '🇨🇴', dialCode: '+57' },
    { code: 'VE', name: 'Venezuela', flag: '🇻🇪', dialCode: '+58' },
    { code: 'UY', name: 'Uruguay', flag: '🇺🇾', dialCode: '+598' },
    { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', dialCode: '+1' },
    { code: 'GB', name: 'Reino Unido', flag: '🇬🇧', dialCode: '+44' },
    { code: 'BR', name: 'Brasil', flag: '🇧🇷', dialCode: '+55' },
];

const selectedCountry = ref<Country | undefined>(countries[0]); // Chile by default
const phoneNumber = ref('');

// Extract phone number from full modelValue on mount
const initializeFromModelValue = () => {
    if (props.modelValue) {
        // Check if it starts with a dial code
        const matchedCountry = countries.find(c => props.modelValue.startsWith(c.dialCode));
        if (matchedCountry) {
            selectedCountry.value = matchedCountry;
            phoneNumber.value = props.modelValue.substring(matchedCountry.dialCode.length).trim();
        } else {
            // If no country code found, use default Chile and treat as local number
            phoneNumber.value = props.modelValue.replace(/^\+56/, '').trim();
        }
    }
};

initializeFromModelValue();

// Format phone number: group from right to left for Chilean format
// 9 digits -> "9 8765 4321" (1 + 4 + 4)
const formatPhoneNumber = (value: string): string => {
    // Remove all non-numeric characters
    const clean = value.replace(/\D/g, '');
    
    if (clean.length === 0) return '';
    
    // For Chilean numbers (9 digits), format as: 9 8765 4321
    // Group from RIGHT to LEFT
    if (clean.length <= 4) {
        return clean;
    } else if (clean.length <= 8) {
        // Last 4 digits + remaining
        return clean.slice(0, -4) + ' ' + clean.slice(-4);
    } else {
        // Full format: first digit(s) + 4 + 4
        const lastFour = clean.slice(-4);
        const middleFour = clean.slice(-8, -4);
        const firstDigits = clean.slice(0, -8);
        return firstDigits + ' ' + middleFour + ' ' + lastFour;
    }
};

const handlePhoneInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const formatted = formatPhoneNumber(input.value);
    phoneNumber.value = formatted;
    
    // Emit full phone number with country code
    if (selectedCountry.value) {
        const fullNumber = `${selectedCountry.value.dialCode}${formatted.replace(/\s/g, '')}`;
        emit('update:modelValue', fullNumber);
    }
};

const handleCountryChange = () => {
    // Update the full number when country changes
    if (selectedCountry.value) {
        const fullNumber = `${selectedCountry.value.dialCode}${phoneNumber.value.replace(/\s/g, '')}`;
        emit('update:modelValue', fullNumber);
    }
};

const displayValue = computed(() => phoneNumber.value);
</script>

<template>
    <div class="flex gap-2 w-full">
        <!-- Country Selector -->
        <select 
            v-model="selectedCountry"
            @change="handleCountryChange"
            class="w-[35%] sm:w-[30%] px-2 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        >
            <option 
                v-for="country in countries" 
                :key="country.code"
                :value="country"
            >
                {{ country.flag }} {{ country.dialCode }}
            </option>
        </select>
        
        <!-- Phone Number Input -->
        <input 
            type="tel"
            :value="displayValue"
            @input="handlePhoneInput"
            :required="required"
            placeholder="9 8765 4321"
            maxlength="11"
            style="min-width: 0;"
            class="w-[65%] sm:w-[70%] px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
    </div>
</template>
