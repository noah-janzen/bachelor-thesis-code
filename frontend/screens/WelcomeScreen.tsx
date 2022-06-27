import { StyleSheet, View } from 'react-native'
import { NavigationProp, ParamListBase } from '@react-navigation/native'

import Button from '../components/ui/Button'
import Title from '../components/ui/Title'
import Container from '../components/ui/StartScreens/Container'
import IntroText from '../components/ui/StartScreens/IntroText'

export type Props = {
  navigation: NavigationProp<ParamListBase>
}

function WelcomeScreen({ navigation }: Props) {
  function loginClickHandler() {
    navigation.navigate('LoginScreen')
  }

  function registerClickHandler() {
    navigation.navigate('RegistrationCredentialsScreen')
  }

  return (
    <Container justifyContent="flex-end">
      <View style={{ marginTop: 48 }}>
        <Title>Willkommen bei NewsRecs</Title>
        <IntroText />
      </View>

      <View style={styles.buttonsContainer}>
        <Button onPress={registerClickHandler} style={styles.topButton} outline>
          Registrieren
        </Button>
        <Button onPress={loginClickHandler}>Anmelden</Button>
      </View>
    </Container>
  )
}

export default WelcomeScreen

const styles = StyleSheet.create({
  buttonsContainer: {
    marginTop: 48,
  },
  topButton: {
    marginBottom: 12,
  },
})
