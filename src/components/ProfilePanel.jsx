import { Button, Flex, Grid, Heading, View } from "@aws-amplify/ui-react";

export default function ProfilePanel({ userprofiles, signOut }) {
    return (
        <>
            <Grid margin="1rem 0 2rem" autoFlow="column" justifyContent="center" gap="2rem" alignContent="center">
                {userprofiles.map(u => (
                    <Flex key={u.id || u.email} direction="column" alignItems="center" gap="0.5rem">
                        <View><Heading level="4">{u.email}</Heading></View>
                    </Flex>
                ))}
            </Grid>
            <Button onClick={signOut}>Sign Out</Button>
        </>
    );
}
