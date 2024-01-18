const encodedUsername = bcrypt.hashSync("votre_salt" + Math.random().toString(36).substring(7), 10);
res.cookie('lgn', encodedUsername + req.cookies.lgn, { httpOnly: true });


