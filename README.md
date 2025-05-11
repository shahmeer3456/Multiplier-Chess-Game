// Frontend/src/pages/Checkout.js
const [formData, setFormData] = useState({
  customer: {
    fullName: '',
    email: ''
  },
  shippingAddress: {
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States'
  },
  payment: {
    method: 'creditCard',
    creditCard: {
      number: '',
      name: '',
      expiryDate: '',
      cvv: ''
    }
  }
});

// Validation is more organized
const validateCustomer = (customer, errors) => {
  if (!customer.fullName) errors.push('Full name is required');
  if (!customer.email || !/^\S+@\S+\.\S+$/.test(customer.email)) 
    errors.push('Valid email is required');
  
  return errors;
};

const validateShippingAddress = (address, errors) => {
  if (!address.address) errors.push('Address is required');
  // ... more validations
  return errors;
};

const validateForm = () => {
  let errors = [];
  
  errors = validateCustomer(formData.customer, errors);
  errors = validateShippingAddress(formData.shippingAddress, errors);
  // ... more validations
  
  return errors;
};
