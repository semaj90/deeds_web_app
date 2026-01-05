
export const generateUser = () => {
	const id = Math.random().toString(36).substring(7);
	return {
		email: `testuser_${id}@example.com`,
		password: 'Password123!',
		firstName: 'Test',
		lastName: 'User'
	};
};
